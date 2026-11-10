"""Bounded public provenance/source acquisition; no publication or install scripts."""
import base64
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

metadata, destination = map(Path, sys.argv[1:])
meta = json.loads(metadata.read_text(encoding='utf-8-sig'))
destination.mkdir(parents=True, exist_ok=False)


def get(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('registry.npmjs.org', 'codeload.github.com') or parsed.username or parsed.password:
        raise ValueError('unexpected download origin')
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'tiny-candidate-review/1'}), timeout=60) as response:
        final = urlsplit(response.url)
        if final.scheme != 'https' or final.hostname != parsed.hostname:
            raise ValueError('unexpected download redirect')
        data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise ValueError('download size limit')
    return data


attestation = get(meta['dist']['attestations']['url'])
(destination / 'attestations.json').write_bytes(attestation)
payloads = []


def visit(value):
    if isinstance(value, dict):
        if 'payload' in value and isinstance(value['payload'], str):
            try:
                payload = json.loads(base64.b64decode(value['payload'], validate=True))
                if 'predicate' in payload:
                    payloads.append(payload)
            except (ValueError, json.JSONDecodeError):
                pass
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)


visit(json.loads(attestation))
(destination / 'provenance-payloads.json').write_text(json.dumps(payloads, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'payloads': len(payloads), 'attestationSha256': hashlib.sha256(attestation).hexdigest()}))
provenance = [p for p in payloads if p['predicateType'] == 'https://slsa.dev/provenance/v1']
if len(provenance) != 1:
    raise ValueError('ambiguous provenance')
expected = base64.b64decode(meta['dist']['integrity'].removeprefix('sha512-'), validate=True).hex()
if any(len(p['subject']) != 1 or any(s['name'] != f'pkg:npm/%40mermaid-js/tiny@{meta["version"]}' or s['digest'].get('sha512') != expected for s in p['subject']) for p in payloads):
    raise ValueError('provenance subject differs from npm integrity')
deps = provenance[0]['predicate']['buildDefinition']['resolvedDependencies']
sources = [d for d in deps if d['uri'].startswith('git+https://github.com/mermaid-js/mermaid@')]
if len(sources) != 1:
    raise ValueError('unexpected source repository')
commit = sources[0]['digest']['gitCommit']
if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
    raise ValueError('unsafe source commit')
url = f'https://codeload.github.com/mermaid-js/mermaid/tar.gz/{commit}'
data = get(url)
(destination / 'source.tar.gz').write_bytes(data)
root = destination.resolve()
extended = Path('\\\\?\\' + str(root)) if sys.platform == 'win32' else root
seen, total, files, skipped = set(), 0, 0, []
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for count, member in enumerate(archive, 1):
        name = member.name.rstrip('/') if member.isdir() else member.name
        parts = name.split('/')
        if count > 20000 or not parts or parts[0] != f'mermaid-{commit}' or any(p in ('', '.', '..') or ':' in p or '\\' in p for p in parts):
            raise ValueError('unsafe source archive path/count')
        if name.casefold() in seen:
            raise ValueError('duplicate source path')
        seen.add(name.casefold())
        total += max(member.size, 0)
        if member.size < 0 or total > 256 * 1024 * 1024:
            raise ValueError('source expansion limit')
        target = extended.joinpath(*parts)
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        elif member.isfile():
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(archive.extractfile(member).read())
            files += 1
        elif member.issym():
            skipped.append(name)
        else:
            raise ValueError('unsupported source archive type')
record = {'version': meta['version'], 'sourceCommit': commit, 'url': url, 'sourceTarSha256': hashlib.sha256(data).hexdigest(), 'sourceTarBytes': len(data), 'regularFiles': files, 'expandedBytes': total, 'omittedSymlinks': skipped, 'provenanceSubjectMatchesIntegrity': True}
(destination / 'source-record.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps(record))
