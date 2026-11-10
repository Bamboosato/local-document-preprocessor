"""Synthetic fixtures exercise framing and evidence boundaries, not legal judgment."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from scripts.review_font_chain import inspect_pfb, adobe_notice, ADOBE, MAX_FONT_BYTES
from scripts.review_pdfjs_history import compare
from scripts.compare_borrowed_sources import NAMES


def segment(kind, payload):
    return bytes([128, kind]) + len(payload).to_bytes(4, 'little') + payload


class FontChainTests(unittest.TestCase):
    def test_ascii_and_encrypted_boundaries(self):
        """Type1 markers and notice are found only in cleartext; encrypted text is not interpreted."""
        notice = ADOBE + b'\r% All Rights Reserved.\r'
        text = b'%!PS-AdobeFont-1.0: Test\r' + notice + b'/shareddict /makeblendedfont'
        raw = segment(1, text) + segment(2, ADOBE + b'/makeblendedfont') + b'\x80\x03'
        result = inspect_pfb(raw)
        self.assertTrue(result['segments'][0]['type1Header'])
        self.assertTrue(result['segments'][0]['makeblendedfont'])
        self.assertNotIn('makeblendedfont', result['segments'][1])
        self.assertEqual(adobe_notice(raw, result), notice)
        self.assertEqual(result, inspect_pfb(raw))

    def test_invalid_lengths_types_termination_and_restore(self):
        """No missing end marker or corrupt payload can become a valid grant observation."""
        valid = segment(1, b'%!PS-AdobeFont-1.0: Test') + b'\x80\x03'
        for raw in [b'', b'\x80', b'\x80\x04', valid[:-2], valid + b'x', b'\x80\x01\xff\xff\xff\x7f', segment(2, b'x') + b'\x80\x03', segment(1, ADOBE) + b'\x80\x03']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                inspect_pfb(raw)
        self.assertEqual(len(inspect_pfb(valid)['segments']), 1)
        with self.assertRaises(ValueError):
            inspect_pfb(bytes(MAX_FONT_BYTES + 1))

    def test_missing_and_changed_notice(self):
        """No notice is an observation gap, not permission; changed notice must fail replay."""
        raw = segment(1, b'%!PS-AdobeFont-1.0: Test') + b'\x80\x03'
        with self.assertRaises(ValueError):
            adobe_notice(raw, inspect_pfb(raw))
        raw = segment(1, ADOBE + b'\r% All Rights Reserved.\r/shareddict') + b'\x80\x03'
        obs = inspect_pfb(raw)
        with self.assertRaises(ValueError):
            adobe_notice(raw.replace(b'1990', b'1991'), obs)

    def test_bounded_history_and_explicit_delta(self):
        """Multiple matching snapshots remain multiple; absent closures and hash drift fail."""
        parent = Path('tmp/font-chain-tests');parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as temp:
            folder = Path(temp)
            source = ''
            for name in NAMES:
                body = '    this.dict = str.dict;\n' if name == 'FlateStream' else ''
                source += f'var {name} = (function X() {{\n{body}return {name};\n}})();\n'
                local = source[source.rfind('var '):]
                if name == 'FlateStream': local = local.replace('    this.dict', '    // this.dict')
                (folder / ('pdflib-' + name + '.txt')).write_text(local, encoding='utf-8')
            rows = []
            for letter in ['a', 'b']:
                commit = letter * 40
                raw = source.encode();(folder / (commit + '.txt')).write_bytes(raw)
                rows.append({'commit': commit, 'sha256': hashlib.sha256(raw).hexdigest()})
            inv = {'query': 'synthetic', 'inputs': rows}
            self.assertEqual([r['matchCount'] for r in compare(folder, inv, folder)['results']], [7, 7])
            for bad in [{'query': '', 'inputs': []}, {'query': '', 'inputs': rows * 2}, {'query': '', 'inputs': [{'commit': '../outside', 'sha256': ''}]}]:
                with self.assertRaises(ValueError): compare(folder, bad, folder)
            (folder / ('a'*40 + '.txt')).write_bytes(b'changed')
            with self.assertRaises(ValueError): compare(folder, inv, folder)
            (folder / 'pdflib-Stream.txt').write_text('missing', encoding='utf-8')
            with self.assertRaises(ValueError): compare(folder, inv, folder)


if __name__ == '__main__':
    unittest.main()
