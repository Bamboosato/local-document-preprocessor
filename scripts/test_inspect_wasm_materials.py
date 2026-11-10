"""Synthetic fixtures test evidence boundaries, not license compliance."""
import unittest
from scripts.inspect_wasm_materials import inspect, verify_blobs, font_array, active_data_overlay, Reader, MAX_BYTES
import hashlib

HEADER = b'\0asm\x01\0\0\0'


def leb(n):
    out = bytearray()
    while True:
        b = n & 127
        n >>= 7
        out.append(b | (128 if n else 0))
        if not n:
            return bytes(out)


def section(id, data):
    return bytes([id]) + leb(len(data)) + data


def segment(payload, flag=1):
    prefix = {0: b'\0\x41\0\x0b', 1: b'\1', 2: b'\2\0\x41\0\x0b'}[flag]
    return prefix + leb(len(payload)) + payload


class DataEvidenceTests(unittest.TestCase):
    def test_normal_active_passive_and_offsets(self):
        """Only data payloads are evidence; offsets point to actual input bytes."""
        path = b'/registry/src/example/encoding_rs-0.8.35/src/lib.rs\0'
        binary = HEADER + section(11, b'\3' + b''.join(segment(path, f) for f in (0, 1, 2)))
        result = inspect(binary)
        self.assertEqual(result['dataSegments'], 3)
        rows = result['registryPathEvidence']
        self.assertEqual([(r['name'], r['version']) for r in rows], [('encoding_rs', '0.8.35')])
        self.assertEqual(len(rows[0]['occurrences']), 3)
        for r in rows[0]['occurrences']:
            self.assertTrue(binary[r['fileOffset']:].startswith(b'/registry/src/'))
        self.assertEqual(result, inspect(binary))

    def test_code_and_custom_strings_are_not_data_evidence(self):
        """Debug/synthetic strings outside data cannot establish an observed component."""
        path = b'/registry/src/example/fnv-1.0.7/src/lib.rs'
        result = inspect(HEADER + section(0, b'\4name' + path) + section(10, path))
        self.assertEqual(result['registryPathEvidence'], [])
        self.assertEqual(result['dataSegments'], 0)

    def test_markers_and_empty_boundary(self):
        """A copyright marker is retained without interpreting missing markers as exclusion."""
        marker = b'Copyright (c) 1990-1994 Adobe Systems Incorporated'
        result = inspect(HEADER + section(11, b'\1' + segment(marker)))
        self.assertEqual(result['markers'][0]['marker'], 'adobe-font-copyright')
        self.assertEqual(inspect(HEADER)['markers'], [])

    def test_malformed_and_restored_state(self):
        """Malformed lengths/offsets/flags and duplicate data fail; a fresh valid input succeeds."""
        valid = section(11, b'\1' + segment(b'x'))
        cases = [b'', HEADER + b'\x0b\x80', HEADER + b'\x0b\x02\0',
                 HEADER + section(11, b'\1\3'), HEADER + section(11, b'\1\0\x42\0\x0b\0'),
                 HEADER + section(11, b'\1\0\x41\0\0\0'), HEADER + section(11, b'\0x'),
                 HEADER + valid + valid, HEADER + section(11, b'\1\1\2x'),
                 HEADER + section(11, leb(100001))]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                inspect(value)
        self.assertEqual(inspect(HEADER + valid)['dataSegments'], 1)

    def test_leb_overflow_and_size_bound(self):
        """Five-byte overflow and oversized input fail instead of unbounded parsing."""
        for raw in [b'\x80' * 5, b'\xff\xff\xff\xff\x1f']:
            with self.assertRaises(ValueError):
                Reader(raw).leb()
        with self.assertRaises(ValueError):
            Reader(b'\xff\xff\xff\xff\x0f').leb(signed=True)
        self.assertEqual(Reader(b'\xff\xff\xff\xff\x7f').leb(signed=True), -1)
        with self.assertRaises(ValueError):
            inspect(HEADER + bytes(MAX_BYTES))

    def test_blob_record_mismatch_and_section_boundary(self):
        """Hash equality outside data is rejected; record drift and wrong hashes fail."""
        payload = b'known font bytes'
        binary = HEADER + section(0, b'\4name' + payload) + section(11, b'\1' + segment(payload))
        expected = inspect(binary)
        blob = {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'wasmOffset': binary.rfind(payload)}
        self.assertEqual(verify_blobs(binary, expected, [blob]), expected)
        for bad in [{**blob, 'wasmOffset': binary.find(payload)}, {**blob, 'sha256': '0'*64}]:
            with self.assertRaises(ValueError):
                verify_blobs(binary, expected, [bad])
        with self.assertRaises(ValueError):
            verify_blobs(binary, {**expected, 'bytes': 0}, [blob])

    def test_font_literal_without_execution(self):
        """Counted byte literals are accepted; expressions, overflow and wrong counts fail."""
        source = b'const std::array<uint8_t, 2> Font = {{0x0, 0xff, }};'
        self.assertEqual(font_array(source), b'\0\xff')
        for bad in [source.replace(b'2>', b'3>'), source.replace(b'0xff', b'0x100'), source.replace(b'0xff', b'call()')]:
            with self.assertRaises(ValueError):
                font_array(bad)

    def test_split_data_zero_gap_and_write_order(self):
        """Section boundaries/omitted zeros must not be mistaken for a source-version mismatch."""
        def active(offset, value):
            return b'\0\x41' + bytes([offset]) + b'\x0b' + leb(len(value)) + value
        binary = HEADER + section(11, b'\3' + active(0, b'ab') + active(4, b'cd') + active(1, b'X'))
        self.assertEqual(active_data_overlay(binary, inspect(binary)), b'aX\0\0cd')
        bad = inspect(binary)
        bad['dataRanges'][0]['memoryOffset'] = MAX_BYTES
        with self.assertRaises(ValueError):
            active_data_overlay(binary, bad)


if __name__ == '__main__':
    unittest.main()
