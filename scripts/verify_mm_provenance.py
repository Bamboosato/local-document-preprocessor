"""Replay static MM comparisons; full reference/initial-source inputs are optional and local."""
import argparse
import hashlib
import json
from pathlib import Path
from scripts.review_font_chain import inspect_pfb
from scripts.review_mm_provenance import initial_font_array, tokens, definition, adobe_prefix, prepare_appendix_a, fingerprint


def verify(root=Path(__file__).resolve().parent.parent, initial_directory=None, reference_directory=None):
    record = json.loads((root / 'docs/evidence/mm-font-provenance-review.json').read_text(encoding='utf-8'))
    prior = json.loads((root / 'docs/evidence/font-permission-chain-review.json').read_text(encoding='utf-8'))
    wasm = (root / 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm').read_bytes()
    h = lambda b: hashlib.sha256(b).hexdigest()
    if h(wasm) != record['pdfiumWasmSha256'] or h(wasm) != prior['pdfiumWasmSha256']:
        raise ValueError('MM provenance WASM changed')
    for font in record['fonts']:
        raw = wasm[font['wasmOffset']:font['wasmOffset'] + font['bytes']]
        if h(raw) != font['sha256'] or not any(f['pfb']['sha256'] == font['sha256'] for f in prior['fonts']):
            raise ValueError('MM font changed')
        pfb = inspect_pfb(raw)
        cleartext = b''.join(raw[s['offset']:s['offset'] + s['bytes']] + b'\n' for s in pfb['segments'] if s['kind'] == 1)
        if fingerprint(adobe_prefix(cleartext, font['appendixAPrefixTokenCount'])) != record['adobeReference']['appendixATokenSha256']:
            raise ValueError('MM Appendix A comparison changed')
        for name, key, indirect in [('ConvertDesignVector', 'convertDesignVectorSha256', False), ('NormalizeDesignVector', 'normalizeDesignVectorSha256', False), ('findfont', 'findfontSha256', True)]:
            if fingerprint(definition(cleartext, name, indirect=indirect)) != font[key]:
                raise ValueError('MM procedure changed')
        expected = b'/NormalizeDesignVector { ' + b' '.join(f'exch {lo} sub {hi-lo} div'.encode() for lo, hi in font['normalizePrintedDesignRanges']) + b' } bind def'
        if definition(cleartext, 'NormalizeDesignVector') != tokens(expected):
            raise ValueError('MM design-range template changed')
        if initial_directory is not None:
            source = (Path(initial_directory) / font['initialSourceFixture']).read_bytes()
            if h(source) != font['initialSource']['sha256'] or initial_font_array(source) != raw:
                raise ValueError('initial MM source/data mismatch')
    for item in record['referenceMaterials']:
        raw = (root / item['source']).read_bytes()
        if len(raw) != item['bytes'] or h(raw) != item['sha256']:
            raise ValueError('initial reference material changed')
    if reference_directory is not None:
        directory = Path(reference_directory)
        if h((directory / 'adobe-5015.pdf').read_bytes()) != record['adobeReference']['sha256']:
            raise ValueError('Adobe PDF changed')
        pages = {}
        for n, digest in record['adobeReference']['extractedPagesSha256CanonicalLF'].items():
            raw = (directory / f'adobe-5015-p{n}-46.txt').read_bytes()
            if h(raw.replace(b'\r\n', b'\n')) != digest: raise ValueError('Adobe extracted page changed')
            pages[int(n)] = raw.decode('utf-8').replace('\r\n', '\n')
        a = tokens(prepare_appendix_a(pages))
        if len(a) != record['adobeReference']['appendixATokenCount'] or fingerprint(a) != record['adobeReference']['appendixATokenSha256']:
            raise ValueError('Adobe Appendix A reference changed')
        text = pages[45]
        text = text[text.index('/ConvertDesignVector {'):text.index('} bind def') + len('} bind def')]
        if fingerprint(definition(text.encode('ascii'), 'ConvertDesignVector')) != record['adobeReference']['appendixDTokenSha256']:
            raise ValueError('Adobe Appendix D reference changed')
    print('MM token/initial-data observations and reference notices passed; outline lineage and remaining permission conditions are not cleared')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--initial-directory')
    parser.add_argument('--reference-directory')
    args = parser.parse_args()
    verify(initial_directory=args.initial_directory, reference_directory=args.reference_directory)
