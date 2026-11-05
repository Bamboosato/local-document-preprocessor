"""Build a local, explicitly incomplete ELK review candidate; never publish it."""
import argparse
import hashlib
import json
import re
import stat
import tarfile
import zipfile
from pathlib import Path

import verify_elk_candidate as verify_elk

PROJECT = Path(__file__).resolve().parents[1]
BASE = PROJECT / 'tmp/elk-fixed-source-7ca'
OLD = PROJECT / 'tmp/cur04-local/run-i/elkjs-0.9.3.zip'
OLD_SHA = '1fbd83748e92e19aab1b5ba248590878f9a0a6a28fab91766e4b0f4b0600fe69'
TAR_SHA = 'd4c3c857046d3543bb9d60bee5e004dcc36bc002792fe487aa92ce4461a29814'
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}')
LOCAL = re.compile(rb'(?i)(?:[a-z]:[\\/](?:users|documents and settings)[\\/][^\\/\s"\x27<>]+|/(?:users|home)/[^/\s"\x27<>]+|[a-z]:[\\/]work_codex(?:[\\/]|\b))')
FORBIDDEN = re.compile(r'(?i)(^|/)(?:\.git|\.env[^/]*|id_rsa|id_ed25519|credentials(?:\.json)?)(?:/|$)|\.(?:pem|key|p12|pfx)$')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check_entry(path, data):
    parts = path.split('/')
    if (not path or path.startswith('/') or '\\' in path or ':' in path or
            re.search(r'[\x00-\x1f\x7f]', path) or FORBIDDEN.search(path) or
            any(part in ('', '.', '..') or part.endswith((' ', '.')) or
                re.match(r'(?i)^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part)
                for part in parts)):
        raise ValueError('unsafe-path')
    if SECRET.search(data) or LOCAL.search(data):
        raise ValueError('sensitive-pattern')


def build(output):
    # Never write to dist, the repository index, or an existing output.
    if output.resolve().parent != BASE.resolve() or not re.fullmatch(r'elkjs-11-roots-review-[a-z0-9]+\.zip', output.name):
        raise ValueError('invalid-output')
    if output.exists():
        raise FileExistsError('output-already-exists')
    archive = BASE / 'elk-7ca.tar.gz'
    if digest(archive.read_bytes()) != TAR_SHA or digest(OLD.read_bytes()) != OLD_SHA:
        raise ValueError('input-hash-mismatch')
    commit = json.loads((BASE / 'commit.json').read_text(encoding='utf8'))
    tree = json.loads((BASE / 'root-tree.json').read_text(encoding='utf8'))
    verify_elk.verify(archive, commit, tree)
    trace = json.loads((PROJECT / 'docs/evidence/json-elk-source-trace.json').read_text(encoding='utf8'))
    roots = trace['sourceRoots']
    if len(roots) != 11 or len(set(roots)) != 11:
        raise ValueError('invalid-roots')
    payload = {}

    def add(path, data):
        check_entry(path, data)
        if path.casefold() in {p.casefold() for p in payload}:
            raise ValueError('duplicate-path')
        payload[path] = data

    with zipfile.ZipFile(OLD) as old:
        if old.testzip() is not None or len(old.namelist()) != len(set(old.namelist())):
            raise ValueError('old-archive-invalid')
        for info in old.infolist():
            if info.filename.startswith(('source/', 'npm-originals/', 'reviewed-originals/', 'evidence/')):
                if info.is_dir() or info.file_size > verify_elk.MAX_FILE:
                    raise ValueError('old-entry-invalid')
                add(info.filename, old.read(info))
    if sum(name.startswith('source/') for name in payload) != 58:
        raise ValueError('old-source-count')
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            if not member.isfile():
                continue
            rel = member.name[len(verify_elk.ROOT):]
            if rel == 'LICENSE.md' or any(rel.startswith(root + '/') for root in roots):
                add('elk-source-candidate/' + rel, tar.extractfile(member).read())
    if sum(name.startswith('elk-source-candidate/') for name in payload) != 659:
        raise ValueError('elk-source-count')
    entries = [{'path': name, 'bytes': len(data), 'sha256': digest(data)} for name, data in sorted(payload.items())]
    manifest = {'schema': 1, 'status': 'local-review-candidate-only',
                'scope': 'elkjs 0.9.3 fixed source and 11 ELK source roots at candidate commit; incomplete build provenance and completeness undetermined; not approved for distribution',
                'elkjs_commit': 'a8304cf79fde75bc2ab1a89d28320f53f8637436',
                'elk_candidate_commit': verify_elk.COMMIT, 'source_archive_sha256': TAR_SHA,
                'previous_candidate_sha256': OLD_SHA, 'files': entries}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf8')
    add('MANIFEST.json', manifest_bytes)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as out:
        if out.testzip() is not None or out.namelist() != sorted(payload):
            raise ValueError('output-archive-invalid')
        for name, data in payload.items():
            if digest(out.read(name)) != digest(data):
                raise ValueError('output-content-mismatch')
    return {'entries': len(payload), 'sha256': digest(output.read_bytes()), 'manifest_sha256': digest(manifest_bytes)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', help='new elkjs-11-roots-review-NAME.zip in local tmp/elk-fixed-source-7ca')
    args = parser.parse_args()
    try:
        print(json.dumps(build(BASE / args.output)))
    except (OSError, ValueError, zipfile.BadZipFile, tarfile.TarError):
        parser.exit(1, 'candidate creation failed; inspect local inputs\n')
