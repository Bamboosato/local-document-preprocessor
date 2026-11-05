import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('build_elk_generator_candidate', Path(__file__).with_name('build_elk_generator_candidate.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GeneratorCandidateTests(unittest.TestCase):
    def test_unknown_variant_fails_before_input(self):
        with self.assertRaisesRegex(ValueError, 'invalid-variant'):
            module.build('unknown', module.OUTPUT_DIR / 'elkjs-generator-review-7ca-a.zip')

    def test_variant_output_name_and_directory_are_enforced(self):
        for output in (module.OUTPUT_DIR / 'elkjs-generator-review-9bc-a.zip',
                       module.PROJECT / 'dist/elkjs-generator-review-7ca-a.zip',
                       module.OUTPUT_DIR / '../elkjs-generator-review-7ca-a.zip'):
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, 'invalid-output'):
                module.build('7ca', output)

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'OUTPUT_DIR', Path(directory)):
            output = Path(directory) / 'elkjs-generator-review-7ca-test.zip'
            output.write_bytes(b'existing')
            with self.assertRaises(FileExistsError):
                module.build('7ca', output)
            self.assertEqual(output.read_bytes(), b'existing')

    def test_unverified_source_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'wrong.tar.gz').write_bytes(b'wrong')
            output = root / 'elkjs-generator-review-7ca-test.zip'
            fake = {**module.VARIANTS['7ca'], 'directory': root, 'tar': 'wrong.tar.gz'}
            with patch.object(module, 'OUTPUT_DIR', root), patch.dict(module.VARIANTS, {'7ca': fake}):
                with self.assertRaisesRegex(ValueError, 'input-hash-mismatch'):
                    module.build('7ca', output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
