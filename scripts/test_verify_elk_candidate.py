import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('verify_elk_candidate', Path(__file__).with_name('verify_elk_candidate.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def git_hash(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


class VerifyCandidateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'candidate.tar.gz'
        self.commit = {'sha': module.COMMIT, 'tree': {'sha': module.TREE}}
        self.tree = {'sha': module.TREE, 'truncated': False, 'tree': [
            {'type': 'blob', 'path': 'src/a', 'sha': git_hash(b'abc')},
        ]}

    def archive(self, files):
        with tarfile.open(self.path, 'w:gz') as tar:
            for name, data in files:
                info = tarfile.TarInfo(module.ROOT + name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))

    def test_matching_content_passes(self):
        self.archive([('src/a', b'abc')])
        self.assertEqual(module.verify(self.path, self.commit, self.tree), {'files': 1, 'bytes': 3})

    def test_modified_missing_duplicate_and_unsafe_paths_fail(self):
        for files in [[('src/a', b'bad')], [], [('src/a', b'abc'), ('src/a', b'abc')], [('../outside', b'abc')]]:
            with self.subTest(files=files):
                self.archive(files)
                with self.assertRaises(ValueError):
                    module.verify(self.path, self.commit, self.tree)

    def test_commit_tree_and_truncation_fail(self):
        self.archive([('src/a', b'abc')])
        for commit, tree in [({'sha': 'wrong', 'tree': {'sha': module.TREE}}, self.tree),
                             (self.commit, {**self.tree, 'truncated': True}),
                             (self.commit, {**self.tree, 'sha': 'wrong'}),
                             (self.commit, {**self.tree, 'tree': []})]:
            with self.subTest(commit=commit, tree=tree):
                with self.assertRaises(ValueError):
                    module.verify(self.path, commit, tree)

    def test_links_and_size_limits_fail(self):
        with tarfile.open(self.path, 'w:gz') as tar:
            info = tarfile.TarInfo(module.ROOT + 'src/a')
            info.type = tarfile.SYMTYPE
            info.linkname = 'elsewhere'
            tar.addfile(info)
        with self.assertRaisesRegex(ValueError, 'invalid-archive-entry'):
            module.verify(self.path, self.commit, self.tree)
        self.archive([('src/a', b'abc')])
        old = module.MAX_FILE
        try:
            module.MAX_FILE = 2
            with self.assertRaisesRegex(ValueError, 'archive-size-limit'):
                module.verify(self.path, self.commit, self.tree)
        finally:
            module.MAX_FILE = old


if __name__ == '__main__':
    unittest.main()
