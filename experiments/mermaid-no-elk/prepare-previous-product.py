"""Create a local previous-product fixture from fixed Git objects, without checkout changes.
No archive is saved or published. Install/build the resulting fixture separately.
"""
import hashlib
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath

COMMIT = '37ec3d3b09624a7efe53e8faa3ba4fa2560bac27'
if len(sys.argv) != 2:
    raise SystemExit('usage: prepare-previous-product.py NEW_OUTPUT')
output = Path(sys.argv[1])
data = subprocess.run(['git', 'archive', COMMIT, 'src', 'public', 'scripts', 'docs/evidence', 'docs/third-party-source-licenses', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'], check=True, capture_output=True).stdout
output.mkdir(parents=True, exist_ok=False)
count = 0
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    for member in archive:
        parts = PurePosixPath(member.name).parts
        if not parts or member.name.startswith('/') or any(p in ('.', '..') or ':' in p or '\\' in p for p in parts):
            raise ValueError('unsafe Git member')
        if member.isdir():
            continue
        if not member.isfile():
            raise ValueError('unexpected Git object type')
        target = output.joinpath(*parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(member).read())
        count += 1
app = output / 'src/App.tsx'
app.write_text(app.read_text(encoding='utf-8').replace('Local Document Preprocessor', 'PWA fixture A'), encoding='utf-8')
worker = output / 'src/json/json.worker.ts'
worker.write_text(worker.read_text(encoding='utf-8') + '\n(self as unknown as {fixture:string}).fixture="A";\n', encoding='utf-8')
record = {'sourceCommit': COMMIT, 'gitObjectSnapshotSha256': hashlib.sha256(data).hexdigest(), 'files': count, 'fixtureChanges': ['App title changed to PWA fixture A', 'Inert worker fixture marker A appended'], 'scope': 'Previous normal Mermaid product, local PWA migration fixture only'}
(output / 'fixture-origin.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps(record))
