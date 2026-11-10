"""Pin the DOMPurify release lock and Babel helper originals without running code."""
import base64
import hashlib
import io
import json
import re
import sys
import tarfile
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

project = Path(__file__).resolve().parents[2]
metadata = json.loads((project / 'tmp/tiny123-dompurify-metadata.json').read_text(encoding='utf-8-sig'))
destination = project / 'tmp/tiny123-dom-helper'
destination.mkdir(exist_ok=False)
sha = lambda data: hashlib.sha256(data).hexdigest()


def get(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('raw.githubusercontent.com', 'registry.npmjs.org'):
        raise ValueError('unexpected origin')
    with urllib.request.urlopen(url, timeout=60) as response:
        final = urlsplit(response.url)
        if final.scheme != 'https' or final.hostname != parsed.hostname:
            raise ValueError('unexpected redirect')
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('download limit')
    return data


commit = metadata['gitHead']
if not re.fullmatch('[a-f0-9]{40}', commit):
    raise ValueError('invalid DOMPurify gitHead')
base = f'https://raw.githubusercontent.com/cure53/DOMPurify/{commit}/'
lock_bytes = get(base + 'package-lock.json')
(destination / 'dompurify-package-lock.json').write_bytes(lock_bytes)
lock = json.loads(lock_bytes)
helper = lock['packages']['node_modules/@babel/helpers']
dist = get(base + 'dist/purify.es.mjs')
(destination / 'dompurify-fixed-dist.mjs').write_bytes(dist)
local = project / 'tmp/tiny123-upstream/mermaid-2086904e76c692331e34a45d7cc3bc30860d040e/node_modules/.pnpm/dompurify@3.4.17/node_modules/dompurify/dist/purify.es.mjs'
if local.read_bytes() != dist:
    raise ValueError('DOMPurify fixed Git dist differs from npm file')
tar_bytes = get(helper['resolved'])
if 'sha512-' + base64.b64encode(hashlib.sha512(tar_bytes).digest()).decode() != helper['integrity']:
    raise ValueError('helper tarball integrity mismatch')
selected = {}
with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode='r:gz') as archive:
    for member in archive:
        if member.name in ('package/LICENSE', 'package/package.json') or re.fullmatch(r'package/lib/helpers/(?:slicedToArray|arrayWithHoles|iterableToArrayLimit|nonIterableRest|unsupportedIterableToArray|regenerator).*\.js', member.name):
            if not member.isfile() or member.size > 1024 * 1024:
                raise ValueError('unexpected helper source type/size')
            selected[member.name] = archive.extractfile(member).read()
pkg = json.loads(selected['package/package.json'])
if pkg['name'] != '@babel/helpers' or pkg['version'] != helper['version']:
    raise ValueError('helper identity mismatch')
original = selected['package/LICENSE']
if not all(x in original for x in (b'MIT', b'Sebastian McKenzie', b'Facebook', b'Permission is hereby granted')):
    raise ValueError('helper original missing expected notices')
(destination / 'babel-helpers-MIT.txt').write_bytes(original)
helper_names = sorted(set(re.findall(r'^function (_(?:slicedToArray|arrayWithHoles|iterableToArrayLimit|nonIterableRest|unsupportedIterableToArray|regenerator)\w*)\(', dist.decode(), re.M)))
record = {'dompurifyVersion': '3.4.17', 'dompurifyGitHead': commit, 'dompurifyDistUrl': base + 'dist/purify.es.mjs', 'dompurifyDistSha256': sha(dist), 'dompurifyNpmDistEqualsFixedGit': True, 'dompurifyLockUrl': base + 'package-lock.json', 'dompurifyLockSha256': sha(lock_bytes), 'helper': {'name': pkg['name'], 'version': pkg['version'], 'tarball': helper['resolved'], 'integrity': helper['integrity'], 'license': pkg.get('license'), 'originalSha256': sha(original), 'originalBytes': len(original), 'files': [{'path': name.removeprefix('package/'), 'sha256': sha(data)} for name, data in sorted(selected.items())]}, 'observedDistHelperNames': helper_names, 'retainedNewNotice': 'regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT)', 'limitations': 'Version follows the fixed DOMPurify release lock and matching published dist. This does not prove the exact historical Babel process or an independently complete generator toolchain.'}
(project / 'docs/evidence/mermaid-tiny-12.3-dom-helper.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'helper': pkg['name'], 'version': pkg['version'], 'licenseBytes': len(original), 'fixedDistEqualsNpm': True, 'distHelperNames': helper_names}))
