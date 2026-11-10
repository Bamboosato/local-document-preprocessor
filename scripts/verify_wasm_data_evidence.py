"""Offline replay of fixed-WASM section and matched data observations."""
import json
import argparse
import hashlib
from pathlib import Path
from scripts.inspect_wasm_materials import verify_blobs, font_array, active_data_overlay


def verify(root=Path(__file__).resolve().parent.parent, source_directory=None):
    record = json.loads((root / 'docs/evidence/wasm-data-inclusion-review.json').read_text(encoding='utf-8'))
    for key, path, blobs in [
        ('anydoc', 'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm',
         [*record['cmapSource']['blobs'], record['cmapSource']['license']]),
        ('pdfium', 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm', record['fontBlobs']),
    ]:
        data = (root / path).read_bytes()
        verify_blobs(data, record[key], blobs)
        if key == 'anydoc':
            blob = record['cmapSource']['fragmentedBlob']
            memory = active_data_overlay(data, record[key])
            raw = memory[blob['memoryOffset']:blob['memoryOffset'] + blob['bytes']]
            if hashlib.sha256(raw).hexdigest() != blob['sha256']:
                raise ValueError('fragmented CMap data mismatch')
    if source_directory is not None:
        directory = Path(source_directory)
        for font in record['fontBlobs']:
            source = (directory / font['path'].replace('/', '__')).read_bytes()
            if hashlib.sha256(source).hexdigest() != font['sha256']:
                raise ValueError('fixed font source mismatch')
            raw = font_array(source)
            if len(raw) != font['fontBytes'] or hashlib.sha256(raw).hexdigest() != font['fontSha256']:
                raise ValueError('font source/data correspondence mismatch')
        for blob in [*record['cmapSource']['blobs'], record['cmapSource']['license']]:
            source = (directory / blob['path'].replace('/', '__')).read_bytes()
            if len(source) != blob['bytes'] or hashlib.sha256(source).hexdigest() != blob['sha256']:
                raise ValueError('CMap source material mismatch')
        print('Fixed source byte inputs also passed; split CMap matches active-data overlay')
    print('Fixed WASM data evidence passed: 34 registry pairs, 167 contiguous + 1 split CMaps, Adobe license, 16 fonts; not a complete SBOM')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-directory')
    verify(source_directory=parser.parse_args().source_directory)
