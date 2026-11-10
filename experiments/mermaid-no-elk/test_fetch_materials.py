"""Abnormal inputs must fail closed without extracting archive paths."""
import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fetch_materials', Path(__file__).with_name('fetch-materials.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(entries):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as output:
        for name, kind, data in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            output.addfile(member, io.BytesIO(data))
    return buffer.getvalue()


class FetchTests(unittest.TestCase):
    record = {'member': 'package/LICENSE', 'bytes': 3, 'sha256': hashlib.sha256(b'MIT').hexdigest()}

    def test_regular_original_and_root_directory(self):
        """A normal root directory is allowed and exact selected bytes are returned."""
        body = archive([('package', tarfile.DIRTYPE, b''), ('package/LICENSE', tarfile.REGTYPE, b'MIT')])
        self.assertEqual(module.selected_files(body, [self.record])['package/LICENSE'], b'MIT')

    def test_unsafe_directory_paths(self):
        """Directory paths cannot bypass traversal/absolute/Windows path checks."""
        for name in ('package/../outside', '/outside', 'C:/outside', 'package\\outside'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                module.selected_files(archive([(name, tarfile.DIRTYPE, b'')]), [])

    def test_duplicate_directories(self):
        """Duplicate directory records are rejected before file filtering."""
        with self.assertRaises(ValueError):
            module.selected_files(archive([('package', tarfile.DIRTYPE, b'')] * 2), [])

    def test_entry_limit_includes_directories(self):
        """Exactly the limit passes; one extra directory fails."""
        body = archive([('a', tarfile.DIRTYPE, b''), ('b', tarfile.DIRTYPE, b'')])
        with patch.object(module, 'MAX_ENTRIES', 2):
            self.assertEqual(module.selected_files(body, []), {})
        with patch.object(module, 'MAX_ENTRIES', 1), self.assertRaises(ValueError):
            module.selected_files(body, [])

    def test_missing_wrong_hash_and_symlink(self):
        """Missing, modified and symbolic-link originals cannot become valid material."""
        for entries in ([], [('package/LICENSE', tarfile.REGTYPE, b'BAD')], [('package/LICENSE', tarfile.SYMTYPE, b'')]):
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                module.selected_files(archive(entries), [self.record])

    def test_expanded_limit(self):
        """Unselected file contents still count toward the expanded size budget."""
        with patch.object(module, 'MAX_EXPANDED', 2), self.assertRaises(ValueError):
            module.selected_files(archive([('other', tarfile.REGTYPE, b'123')]), [])

    def test_existing_output_never_overwritten(self):
        """Reusing an output directory fails before any network request."""
        plan = Path(__file__).resolve().parents[2] / 'docs/evidence/mermaid-tiny-material-retrieval-plan.json'
        with tempfile.TemporaryDirectory(dir=plan.parents[2] / 'tmp') as directory, patch.object(module, 'download') as network:
            with self.assertRaises(FileExistsError):
                module.fetch(plan, Path(directory))
            network.assert_not_called()

    def test_network_failure_has_no_completion_index(self):
        """Download failure leaves no usable completion marker."""
        plan = Path(__file__).resolve().parents[2] / 'docs/evidence/mermaid-tiny-material-retrieval-plan.json'
        with tempfile.TemporaryDirectory(dir=plan.parents[2] / 'tmp') as directory, patch.object(module, 'download', side_effect=OSError('network unavailable')):
            target = Path(directory) / 'fresh'
            with self.assertRaises(OSError):
                module.fetch(plan, target)
            self.assertFalse((target / 'material-index.json').exists())

    def test_source_hash_failure_has_no_completion_index(self):
        """A successful HTTP fetch with wrong bytes is still an incomplete acquisition."""
        plan = Path(__file__).resolve().parents[2] / 'docs/evidence/mermaid-tiny-material-retrieval-plan.json'
        with tempfile.TemporaryDirectory(dir=plan.parents[2] / 'tmp') as directory, patch.object(module, 'download', return_value=b'wrong source archive'):
            target = Path(directory) / 'fresh'
            with self.assertRaisesRegex(ValueError, 'source archive hash mismatch'):
                module.fetch(plan, target)
            self.assertFalse((target / 'material-index.json').exists())

    def test_unsafe_plan_target_before_network(self):
        """Unsafe destination paths fail preflight without issuing requests."""
        plan_path = Path(__file__).resolve().parents[2] / 'docs/evidence/mermaid-tiny-material-retrieval-plan.json'
        plan = json.loads(plan_path.read_text(encoding='utf-8'))
        plan['source']['files'][0]['target'] = '../outside'
        with tempfile.TemporaryDirectory(dir=plan_path.parents[2] / 'tmp') as directory, patch.object(module, 'download') as network:
            altered = Path(directory) / 'plan.json'
            altered.write_text(json.dumps(plan), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'unsafe relative path'):
                module.fetch(altered, Path(directory) / 'fresh')
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
