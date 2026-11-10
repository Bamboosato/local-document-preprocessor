"""Evidence-boundary tests: these do not decide permission or outline authorship."""
import unittest
from scripts.review_mm_provenance import initial_font_array, tokens, fingerprint, definition, adobe_prefix, prepare_appendix_a


class ProvenanceTests(unittest.TestCase):
    def test_initial_literal_and_bad_count(self):
        """Read counted byte literals without evaluating C expressions."""
        raw = b'const unsigned char Old [2] = { 0x00, 0xff };'
        self.assertEqual(initial_font_array(raw), b'\0\xff')
        for bad in [raw.replace(b'[2]', b'[3]'), raw.replace(b'0xff', b'0x100'), raw.replace(b'0xff', b'call()')]:
            with self.assertRaises(ValueError): initial_font_array(bad)

    def test_comments_and_literal_string_boundaries(self):
        """Comments are ignored externally, but fake definitions and percent signs inside strings survive."""
        source = b'% discarded\n/x (literal % /Fake { }) def /p { (a(b)\\)c) <ab cd> } bind def'
        items = tokens(source)
        self.assertIn(b'(literal % /Fake { })', items)
        self.assertIn(b'(a(b)\\)c)', items)
        self.assertIn(b'<ab cd>', items)
        self.assertEqual(len(definition(source, 'p')), 7)
        with self.assertRaises(ValueError): definition(source, 'Fake')

    def test_names_numbers_and_token_boundaries_are_not_folded(self):
        """A literal-name boundary or numerical spelling change must not disappear."""
        self.assertNotEqual(tokens(b'/ name'), tokens(b'/name'))
        self.assertNotEqual(tokens(b'//name'), tokens(b'/ /name'))
        self.assertNotEqual(tokens(b'1.0'), tokens(b'1'))
        self.assertNotEqual(fingerprint(tokens(b'ab c')), fingerprint(tokens(b'a bc')))
        self.assertEqual(tokens(b'/p {1} %comment\rbind def'), tokens(b'/p\n{ 1 } bind def'))

    def test_procedure_missing_duplicate_and_restored_state(self):
        """No missing, unclosed or duplicate procedure can be reported as a match."""
        valid = b'/p { {1} (}) } bind def'
        self.assertEqual(definition(valid, 'p')[-2:], [b'bind', b'def'])
        for bad in [b'', b'/p {1', valid + valid, b'/p {1} exec', b'/p {(unclosed} def']:
            with self.assertRaises(ValueError): definition(bad, 'p')
        self.assertEqual(definition(valid, 'p')[0], b'/p')
        indirect = b'/findfont {1} bind 3 index exec'
        with self.assertRaises(ValueError): definition(indirect, 'findfont')
        self.assertEqual(definition(indirect, 'findfont', indirect=True)[-3:], [b'3', b'index', b'exec'])

    def test_wrapper_and_invalid_hex_strings(self):
        """Only the selected wrapper is compared; ambiguity and invalid literals fail."""
        raw = b'/shareddict where {1} /other {2} def'
        self.assertEqual(adobe_prefix(raw, 5), [b'/shareddict', b'where', b'{', b'1', b'}'])
        for bad in [raw + raw, b'/shareddict where']:
            with self.assertRaises(ValueError): adobe_prefix(bad, 5)
        for bad in [b'<badZ>', b'<abc', b'>', b'(abc\\']:
            with self.assertRaises(ValueError): tokens(bad)

    def test_pdf_repairs_are_explicit_and_fail_on_changed_layout(self):
        """No generic whitespace/name merging or arbitrary dehyphenation can hide a source change."""
        pages = {35: '35\n/shareddict where /\noperatortype',
                 36: '36\ner-\nrordict if-\nelse /\npackedarraytype', 37: '37\nife-\nlse'}
        result = prepare_appendix_a(pages)
        self.assertIn(b'/operatortype', result)
        self.assertIn(b'errordict', result)
        header = {**pages, 36: pages[36].replace('36\n', '36 Appendix A: The makeblendedfont Operator (15 May 94)\n')}
        self.assertEqual(prepare_appendix_a(header), result)
        bad = {**pages, 36: pages[36].replace('er-\nrordict', 'errordict')}
        with self.assertRaises(ValueError): prepare_appendix_a(bad)


if __name__ == '__main__':
    unittest.main()
