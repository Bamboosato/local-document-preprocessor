import unittest
from unittest.mock import patch
from scripts.review_wasm_remaining import conditional_profile, review
from scripts.compare_borrowed_sources import normalize, closure


class ConditionalProfileTests(unittest.TestCase):
    def test_wrong_archive_bytes_are_rejected_before_reading_or_matching_originals(self):
        package = {'name': 'fixture', 'version': '1.0.0', 'sourceArchive': 'https://static.crates.io/crates/fixture/fixture-1.0.0.crate', 'checksum': '0' * 64}
        with patch('scripts.review_wasm_remaining.fetch', return_value=b'synthetic wrong archive'):
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                review(package)

    def test_explicit_choices_preserve_declared_expression_and_are_not_final_approval(self):
        result = conditional_profile('MIT OR Apache-2.0')
        self.assertEqual(result['preparationRecommendation'], 'MIT')
        self.assertEqual(result['declaredExpressionPreserved'], 'MIT OR Apache-2.0')
        self.assertIn('not determined', result['finalApplicability'])
        self.assertEqual(conditional_profile('Apache-2.0 OR BSL-1.0')['preparationRecommendation'], 'Apache-2.0')

    def test_legacy_syntax_and_unhandled_terms_cannot_silently_erase_conditions(self):
        for expression in ['MIT/Apache-2.0', 'Unlicense/MIT', 'Apache-2.0 / MIT']:
            with self.subTest(expression=expression):
                self.assertIsNone(conditional_profile(expression)['preparationRecommendation'])
                self.assertTrue(conditional_profile(expression)['legacySlashNeedsConfirmation'])
        for expression in ['MIT AND BSD-3-Clause', 'MIT AND Unicode-3.0', 'MIT OR LicenseRef-Unknown', '']:
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                conditional_profile(expression)


class BorrowedSourceFingerprintTests(unittest.TestCase):
    def test_comments_and_quote_spelling_do_not_erase_literal_content(self):
        self.assertEqual(normalize('var a = "x // y"; /* note */'), normalize("var a='x // y';"))
        self.assertNotEqual(normalize("var a='a b';"), normalize("var a='ab';"))
        self.assertNotEqual(normalize('return 1;'), normalize('return 2;'))

    def test_missing_closure_is_unknown_instead_of_equal_empty_sources(self):
        self.assertIsNone(closure('unrelated source', 'Stream'))
        source = 'var Stream = (function StreamClosure() { return Stream; })();'
        self.assertEqual(closure(source, 'Stream'), source)


if __name__ == '__main__':
    unittest.main()
