"""Offline replay of the two fixed MM-font cleartext observations, not legal clearance."""
import hashlib
import json
from pathlib import Path
from scripts.review_font_chain import inspect_pfb, adobe_notice


def verify(root=Path(__file__).resolve().parent.parent):
    record = json.loads((root / 'docs/evidence/font-permission-chain-review.json').read_text(encoding='utf-8'))
    prior = json.loads((root / 'docs/evidence/wasm-data-inclusion-review.json').read_text(encoding='utf-8'))
    wasm = (root / 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm').read_bytes()
    h = lambda b: hashlib.sha256(b).hexdigest()
    if h(wasm) != record['pdfiumWasmSha256'] or h(wasm) != prior['pdfium']['sha256']:
        raise ValueError('MM font WASM changed')
    notice = (root / record['notice']['source']).read_bytes()
    if len(notice) != record['notice']['bytes'] or h(notice) != record['notice']['sha256']:
        raise ValueError('MM notice material changed')
    if len(record['fonts']) != 2:
        raise ValueError('MM font count mismatch')
    for font in record['fonts']:
        pfb = font['pfb']
        raw = wasm[font['wasmOffset']:font['wasmOffset'] + pfb['bytes']]
        if not any(f['wasmOffset'] == font['wasmOffset'] and f['fontSha256'] == pfb['sha256'] for f in prior['fontBlobs']):
            raise ValueError('MM fixed-source reference changed')
        actual = inspect_pfb(raw)
        if actual != pfb or adobe_notice(raw, actual) != notice:
            raise ValueError('MM program/notice observations changed')
    print('Two fixed MM Type1/PFB observations and Adobe notice passed; grant applicability and outline lineage remain unresolved')


if __name__ == '__main__':
    verify()
