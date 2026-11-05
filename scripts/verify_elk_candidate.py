"""Compare a local ELK candidate archive to a previously retrieved GitHub tree.

This reads untrusted archives without extraction and proves bytes against the
provided API records only; it cannot establish build provenance or authorship.
"""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path, PurePosixPath

COMMIT = '7ca51784e42a24201f29bc13e458728b6fc61cdc'
TREE = 'f3d84ee746c3ce3f324d63d4b34120505893f056'
ROOT = 'elk-' + COMMIT + '/'
MAX_FILE = 20 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_ENTRIES = 10000


def verify(archive_path, commit_record, tree_record, commit=COMMIT, tree=TREE):
    if commit_record.get('sha') != commit or commit_record.get('tree', {}).get('sha') != tree:
        raise ValueError('commit-tree-mismatch')
    if tree_record.get('sha') != tree or tree_record.get('truncated') is not False:
        raise ValueError('invalid-or-truncated-tree')
    entries = tree_record.get('tree')
    if not isinstance(entries, list) or len(entries) > MAX_ENTRIES:
        raise ValueError('invalid-tree-entries')
    blobs = {}
    for item in entries:
        if item.get('type') != 'blob':
            continue
        path = item.get('path')
        if not isinstance(path, str) or path in blobs:
            raise ValueError('duplicate-or-invalid-tree-path')
        blobs[path] = item.get('sha')
    if not blobs:
        raise ValueError('empty-tree')
    seen = set()
    total = 0
    with tarfile.open(archive_path, 'r:gz') as archive:
        for member in archive:
            if member.isdir():
                continue
            if not member.isfile() or member.issparse() or not member.name.startswith(ROOT):
                raise ValueError('invalid-archive-entry')
            path = member.name[len(ROOT):]
            if not path or path.startswith('/') or '\\' in path or any(p in ('', '.', '..') for p in path.split('/')) or PurePosixPath(path).is_absolute():
                raise ValueError('unsafe-archive-path')
            if path in seen or len(seen) >= MAX_ENTRIES:
                raise ValueError('duplicate-or-excess-archive-entry')
            seen.add(path)
            if member.size < 0 or member.size > MAX_FILE or total + member.size > MAX_TOTAL:
                raise ValueError('archive-size-limit')
            total += member.size
            data = archive.extractfile(member).read()
            if len(data) != member.size:
                raise ValueError('archive-size-mismatch')
            digest = hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()
            if blobs.get(path) != digest:
                raise ValueError('blob-mismatch')
    if seen != set(blobs):
        raise ValueError('missing-archive-entry')
    return {'files': len(seen), 'bytes': total}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', default='tmp/elk-fixed-source-7ca/elk-7ca.tar.gz')
    parser.add_argument('--commit-json', default='tmp/elk-fixed-source-7ca/commit.json')
    parser.add_argument('--tree-json', default='tmp/elk-fixed-source-7ca/root-tree.json')
    args = parser.parse_args()
    try:
        commit = json.loads(Path(args.commit_json).read_text(encoding='utf8'))
        tree = json.loads(Path(args.tree_json).read_text(encoding='utf8'))
        result = verify(args.archive, commit, tree)
    except (OSError, ValueError, TypeError, tarfile.TarError) as error:
        parser.exit(1, f'verification failed: {type(error).__name__}\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
