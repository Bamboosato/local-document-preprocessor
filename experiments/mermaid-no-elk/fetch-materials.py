"""Fetch pinned minimal materials without caches, package installation, or archive extraction.

Only allowlisted regular-file contents are read from in-memory archives. A failed run
leaves an incomplete directory without material-index.json; never reuse that directory.
"""
import base64
import hashlib
import io
import json
import re
import sys
import tarfile
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

MAX_DOWNLOAD = 32 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_ENTRIES = 20000
sha = lambda data: hashlib.sha256(data).hexdigest()


def relative(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name:
        raise ValueError('unsafe relative path')
    parts = name.split('/')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError('unsafe relative path')
    return PurePosixPath(name)


def download(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('registry.npmjs.org', 'codeload.github.com', 'raw.githubusercontent.com') or parsed.username or parsed.password:
        raise ValueError('unapproved download origin')
    request = urllib.request.Request(url, headers={'User-Agent': 'tiny-material-review/1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        final = urllib.parse.urlsplit(response.url)
        if final.scheme != 'https' or final.hostname != parsed.hostname:
            raise ValueError('unexpected redirect')
        body = response.read(MAX_DOWNLOAD + 1)
    if len(body) > MAX_DOWNLOAD:
        raise ValueError('download limit')
    return body


def selected_files(body, records):
    wanted = {r['member']: r for r in records}
    if len(wanted) != len(records):
        raise ValueError('duplicate requested member')
    found, seen, expanded = {}, set(), 0
    with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as archive:
        for count, member in enumerate(archive, 1):
            # Directory paths and counts must be checked too. No extract() is used.
            normalized = str(relative(member.name.rstrip('/') if member.isdir() else member.name))
            if normalized.casefold() in seen or count > MAX_ENTRIES:
                raise ValueError('duplicate member or entry limit')
            seen.add(normalized.casefold())
            expanded += max(member.size, 0)
            if member.size < 0 or expanded > MAX_EXPANDED:
                raise ValueError('expanded size limit')
            if member.name not in wanted:
                continue
            if not member.isfile() or member.size > MAX_DOWNLOAD:
                raise ValueError('selected member is not a bounded regular file')
            data = archive.extractfile(member).read(MAX_DOWNLOAD + 1)
            record = wanted[member.name]
            if not record.get('identityOnly') and (len(data) != record['bytes'] or sha(data) != record['sha256']):
                raise ValueError('selected file hash mismatch')
            found[member.name] = data
    if set(found) != set(wanted):
        raise ValueError('selected files missing')
    return found


def fetch(plan_path, output):
    plan_bytes = plan_path.read_bytes()
    plan = json.loads(plan_bytes)
    if plan['schema'] != 1 or len(plan['npm']) != 65 or len(plan['originals']) != 2:
        raise ValueError('unexpected plan structure')
    project = Path(__file__).resolve().parents[2]
    for name, digest in plan['evidenceHashes'].items():
        relative(name)
        if sha((project / 'docs/evidence' / name).read_bytes()) != digest:
            raise ValueError('reviewed evidence changed')
    # Preflight all output paths before any requests or writes.
    targets = set()
    for record in plan['source']['files'] + [f for p in plan['npm'] for f in p['files']] + plan['originals']:
        target = str(relative(record['target'])).casefold()
        if target in targets or target == 'material-index.json':
            raise ValueError('duplicate output target')
        targets.add(target)
    output.mkdir(parents=True, exist_ok=False)
    written = []

    def save(record, data):
        target = output.joinpath(*relative(record['target']).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
        written.append({'path': record['target'], 'bytes': len(data), 'sha256': sha(data)})

    archive = download(plan['source']['url'])
    if sha(archive) != plan['source']['sha256']:
        raise ValueError('source archive hash mismatch')
    files = selected_files(archive, plan['source']['files'])
    for record in plan['source']['files']:
        save(record, files[record['member']])
    for count, package in enumerate(plan['npm'], 1):
        archive = download(package['url'])
        if not re.fullmatch(r'sha512-[A-Za-z0-9+/=]+', package['integrity']):
            raise ValueError('unsupported integrity')
        actual = base64.b64encode(hashlib.sha512(archive).digest()).decode()
        if 'sha512-' + actual != package['integrity']:
            raise ValueError('npm tarball integrity mismatch')
        files = selected_files(archive, package['files'])
        identity = json.loads(files['package/package.json'])
        if identity['name'] != package['name'] or identity['version'] != package['version']:
            raise ValueError('package identity mismatch')
        for record in package['files']:
            save(record, files[record['member']])
        if count % 10 == 0:
            print(json.dumps({'downloadedPackages': count}), flush=True)
    for record in plan['originals']:
        data = download(record['url'])
        if len(data) != record['bytes'] or sha(data) != record['sha256']:
            raise ValueError('origin original hash mismatch')
        save(record, data)
    index = {'schema': 1, 'sourceCommit': plan['sourceCommit'], 'planSha256': sha(plan_bytes),
             'packages': [{k: p[k] for k in ('name', 'version', 'patched', 'materialDirectory')} for p in plan['npm'] if 'patched' in p],
             'files': written, 'role': 'Minimal source/original snapshots; not installed or patched runtime dependencies'}
    with (output / 'material-index.json').open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(index, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'passed': True, 'packages': len(index['packages']), 'files': len(written), 'networkRequests': 68, 'planSha256': sha(plan_bytes)}))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: fetch-materials.py PLAN_JSON NEW_EMPTY_OUTPUT')
    fetch(Path(sys.argv[1]), Path(sys.argv[2]))
