import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('build_elk_local_candidate', Path(__file__).with_name('build_elk_local_candidate.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalCandidateTests(unittest.TestCase):
    def test_safe_entry_and_unsafe_paths(self):
        module.check_entry('source/plugin/example.java', b'public class Example {}')
        for path in ('../outside', '/absolute', 'source/../file', 'source//file', 'source/.env',
                     'source/CON.txt', 'source/a\\b', 'source/key.pem'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                module.check_entry(path, b'synthetic')

    def test_sensitive_patterns_fail_closed(self):
        for value in (b'/home/example/secret', b'C:\\Users\\example\\file',
                      b'-----BEGIN PRIVATE KEY-----'):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'sensitive-pattern'):
                module.check_entry('source/example.txt', value)

    def test_output_outside_local_directory_is_rejected_before_input(self):
        for path in (module.PROJECT / 'dist/elkjs-11-roots-review-a.zip',
                     module.BASE / '../elkjs-11-roots-review-a.zip',
                     module.BASE / 'other.zip'):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'invalid-output'):
                module.build(path)

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'BASE', Path(directory)):
            output = Path(directory) / 'elkjs-11-roots-review-test.zip'
            output.write_bytes(b'existing')
            with self.assertRaises(FileExistsError):
                module.build(output)
            self.assertEqual(output.read_bytes(), b'existing')

    def test_input_hash_mismatch_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'BASE', Path(directory)):
            (Path(directory) / 'elk-7ca.tar.gz').write_bytes(b'wrong')
            output = Path(directory) / 'elkjs-11-roots-review-test.zip'
            with self.assertRaisesRegex(ValueError, 'input-hash-mismatch'):
                module.build(output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
