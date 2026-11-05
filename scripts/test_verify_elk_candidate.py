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

    def test_second_fixed_commit_uses_its_own_archive_root(self):
        commit = '9bc93474e1dc649450e8c97abb45d16b7c88e35b'
        tree = '96d01f92f5768fdae183eeb4a93ca9d32719f110'
        with tarfile.open(self.path, 'w:gz') as tar:
            info = tarfile.TarInfo(f'elk-{commit}/src/a')
            info.size = 3
            tar.addfile(info, io.BytesIO(b'abc'))
        self.assertEqual(module.verify(self.path, {'sha': commit, 'tree': {'sha': tree}},
                         {**self.tree, 'sha': tree}, commit, tree), {'files': 1, 'bytes': 3})
        with self.assertRaises(ValueError):
            module.verify(self.path, self.commit, self.tree)

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

    def test_root_and_directory_entries_are_checked(self):
        # A legitimate root and child directory may appear before the file.
        def with_directories(names):
            with tarfile.open(self.path, 'w:gz') as tar:
                for name in names:
                    info = tarfile.TarInfo(name)
                    info.type = tarfile.DIRTYPE
                    tar.addfile(info)
                info = tarfile.TarInfo(module.ROOT + 'src/a')
                info.size = 3
                tar.addfile(info, io.BytesIO(b'abc'))

        with_directories([module.ROOT.rstrip('/'), module.ROOT + 'src'])
        self.assertEqual(module.verify(self.path, self.commit, self.tree), {'files': 1, 'bytes': 3})
        for names in [[module.ROOT + '../outside'], ['/outside'],
                      [module.ROOT + 'src', module.ROOT + 'src/'],
                      [module.ROOT + 'src/a'],
                      [module.ROOT.rstrip('/'), module.ROOT.rstrip('/')]]:
            with self.subTest(names=names):
                with_directories(names)
                with self.assertRaises(ValueError):
                    module.verify(self.path, self.commit, self.tree)

        old = module.MAX_ENTRIES
        try:
            module.MAX_ENTRIES = 3
            # Exactly three total members pass; a fourth directory does not.
            with_directories([module.ROOT.rstrip('/'), module.ROOT + 'src'])
            self.assertEqual(module.verify(self.path, self.commit, self.tree)['files'], 1)
            with_directories([module.ROOT + f'd{i}' for i in range(5)])
            with self.assertRaisesRegex(ValueError, 'duplicate-or-excess-archive-entry'):
                module.verify(self.path, self.commit, self.tree)
        finally:
            module.MAX_ENTRIES = old


if __name__ == '__main__':
    unittest.main()
