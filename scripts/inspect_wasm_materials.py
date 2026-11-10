"""Bounded static data-section survey; never instantiate or execute a WASM module.

This is a section extractor, not a complete WebAssembly validator or an SBOM.
Missing strings do not establish absence of code or license obligations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

MAX_BYTES = 32 * 1024 * 1024
MARKERS = {
    'libpng-diagnostic': b'Application built with libpng-',
    'jpeg-diagnostic': b'Bogus Huffman table definition',
    'openjpeg-diagnostic': b'Malformed JP2 file format: first box must be JPEG 2000 signature box',
    'zlib-diagnostic': b'incorrect data check',
    'adobe-font-copyright': b'Copyright (c) 1990-1994 Adobe Systems Incorporated',
    'adobe-cmap-copyright': b'Copyright 1990-2009 Adobe Systems Incorporated.',
}
CRATE = re.compile(rb'/registry/src/[^/\x00\s]+/([A-Za-z0-9_-]+)-(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?)/([A-Za-z0-9_./-]+)')


class Reader:
    def __init__(self, data, start=0, end=None):
        self.data, self.pos, self.end = data, start, len(data) if end is None else end

    def take(self, n):
        if n < 0 or self.pos + n > self.end:
            raise ValueError('truncated WASM field')
        start = self.pos
        self.pos += n
        return self.data[start:self.pos]

    def leb(self, signed=False):
        value = 0
        for i in range(5):
            byte = self.take(1)[0]
            value |= (byte & 127) << (7 * i)
            if not byte & 128:
                if i == 4 and ((byte & 0x70 not in (0, 0x70)) if signed else byte & 0x70):
                    raise ValueError('LEB128 overflow')
                if signed and byte & 64:
                    value -= 1 << (7 * (i + 1))
                if signed and not -(2**31) <= value < 2**31:
                    raise ValueError('signed LEB128 overflow')
                return value
        raise ValueError('unterminated LEB128')


def inspect(data):
    if len(data) > MAX_BYTES or data[:8] != b'\0asm\x01\0\0\0':
        raise ValueError('unsupported header or size')
    r = Reader(data, 8)
    sections, segments = [], []
    seen_data = False
    while r.pos < r.end:
        section_id = r.take(1)[0]
        length = r.leb()
        start = r.pos
        r.take(length)
        section = {'id': section_id, 'offset': start, 'bytes': length}
        if section_id == 0:
            c = Reader(data, start, r.pos)
            section['name'] = c.take(c.leb()).decode('utf-8', errors='strict')
        sections.append(section)
        if section_id != 11:
            continue
        if seen_data:
            raise ValueError('duplicate data section')
        seen_data = True
        d = Reader(data, start, r.pos)
        count = d.leb()
        if count > 100000:
            raise ValueError('too many data segments')
        for index in range(count):
            flags = d.leb()
            if flags not in (0, 1, 2):
                raise ValueError('unsupported data segment flags')
            memory_index = d.leb() if flags == 2 else 0
            memory_offset = None
            if flags != 1:
                if d.take(1) != b'\x41':
                    raise ValueError('unsupported data offset expression')
                memory_offset = d.leb(signed=True)
                if d.take(1) != b'\x0b':
                    raise ValueError('unterminated data offset expression')
            size = d.leb()
            offset = d.pos
            payload = d.take(size)
            segments.append((index, offset, payload, memory_index, memory_offset))
        if d.pos != d.end:
            raise ValueError('trailing data section bytes')
    crates, markers = {}, []
    for index, offset, payload, _, _ in segments:
        for m in CRATE.finditer(payload):
            key = (m[1].decode(), m[2].decode())
            crates.setdefault(key, []).append({'file': m[3].decode(), 'segment': index, 'fileOffset': offset + m.start()})
        for name, marker in MARKERS.items():
            cursor = 0
            while (pos := payload.find(marker, cursor)) >= 0:
                markers.append({'marker': name, 'segment': index, 'fileOffset': offset + pos})
                cursor = pos + len(marker)
    return {
        'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
        'sections': sections, 'dataSegments': len(segments),
        'dataRanges': [{'segment': i, 'fileOffset': o, 'bytes': len(p), 'memoryIndex': m, 'memoryOffset': a} for i, o, p, m, a in segments],
        'registryPathEvidence': [{'name': n, 'version': v, 'occurrences': rows} for (n, v), rows in sorted(crates.items())],
        'markers': markers,
        'scope': 'Data-section byte observations only; not full validation, exact source attribution, code reachability or complete linked-code SBOM; absence is not exclusion',
    }


def active_data_overlay(data, survey):
    """Static zero-based active-data overlay, not execution or a runtime-state claim."""
    ranges = [r for r in survey['dataRanges'] if r['memoryOffset'] is not None]
    if any(r['memoryIndex'] != 0 or r['memoryOffset'] < 0 or r['memoryOffset'] + r['bytes'] > MAX_BYTES for r in ranges):
        raise ValueError('unsupported active data memory range')
    memory = bytearray(max((r['memoryOffset'] + r['bytes'] for r in ranges), default=0))
    for r in ranges:
        memory[r['memoryOffset']:r['memoryOffset']+r['bytes']] = data[r['fileOffset']:r['fileOffset']+r['bytes']]
    return bytes(memory)


def verify_blobs(data, expected, blobs):
    """Recheck fixed binary and byte slices within parsed data boundaries."""
    actual = inspect(data)
    if actual != expected:
        raise ValueError('WASM survey changed')
    for blob in blobs:
        offset = blob['wasmOffset']
        if offset < 0:
            continue  # Explicit unmatched candidate, never an inclusion claim.
        size = blob.get('fontBytes', blob.get('bytes'))
        digest = blob.get('fontSha256', blob.get('sha256'))
        if not any(r['fileOffset'] <= offset and offset + size <= r['fileOffset'] + r['bytes'] for r in actual['dataRanges']):
            raise ValueError('blob outside WASM data')
        if hashlib.sha256(data[offset:offset + size]).hexdigest() != digest:
            raise ValueError('data blob hash mismatch')
    return actual


def font_array(source):
    """Read the fixed source's literal byte initializer without executing C++."""
    if len(source) > 3 * 1024 * 1024:
        raise ValueError('font source too large')
    match = re.search(rb'std::array<uint8_t,\s*(\d+)>\s+\w+\s*=\s*\{\{(.*?)\}\};', source, re.S)
    if not match or re.sub(rb'0x[0-9a-fA-F]+|[\s,]', b'', match[2]):
        raise ValueError('unsupported font initializer')
    values = [int(v, 16) for v in re.findall(rb'0x([0-9a-fA-F]+)', match[2])]
    if len(values) != int(match[1]) or any(v > 255 for v in values):
        raise ValueError('font initializer length/range mismatch')
    return bytes(values)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wasm')
    parser.add_argument('new_output')
    args = parser.parse_args()
    path = Path(args.wasm)
    if path.stat().st_size > MAX_BYTES:
        raise SystemExit('WASM exceeds size bound')
    result = inspect(path.read_bytes())
    with Path(args.new_output).open('x', encoding='utf-8', newline='\n') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
