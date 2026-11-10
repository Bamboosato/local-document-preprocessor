"""Compare contributing workspace sources with the fixed upstream tar without extracting it."""
import hashlib
import json
import sys
import tarfile
from pathlib import Path

if len(sys.argv) != 6:
    raise SystemExit('usage: verify-workspace-sources.py UPSTREAM_ROOT SOURCE_TAR INVENTORY OUTPUT EXPECTED_SOURCE_SHA256')
root, archive, inventory_file, output = map(Path, sys.argv[1:5])
expected_source_sha256 = sys.argv[5]
sha = lambda data: hashlib.sha256(data).hexdigest()
inventory_bytes = inventory_file.read_bytes()
inventory = json.loads(inventory_bytes)
commit = inventory['sourceCommit']
archive_bytes = archive.read_bytes()
if sha(archive_bytes) != expected_source_sha256 or len(expected_source_sha256) != 64:
    raise SystemExit('source archive mismatch')
tiny_bytes = (root / 'stats/mermaid.tiny.min.js.meta.json').read_bytes()
parser_bytes = (root / 'stats/parser-core-inspect.json').read_bytes()
if sha(tiny_bytes) != inventory['tinyMetafileSha256'] or sha(parser_bytes) != inventory['parserMetafileSha256']:
    raise SystemExit('metafile mismatch')
tiny, parser = json.loads(tiny_bytes), json.loads(parser_bytes)
outputs = list(tiny['outputs'].values())
if len(outputs) != 1:
    raise SystemExit('unexpected tiny outputs')
inputs = [p.replace('\\', '/') for p in outputs[0]['inputs']]
groups = {'mermaid': {p for p in inputs if p.startswith('src/')}, 'parser': set()}
parser_chunks = [p[len('../parser/'):] for p in inputs if p.startswith('../parser/dist/')]
if len(parser_chunks) != inventory['parserChunksUsed']:
    raise SystemExit('unexpected parser chunks')
for chunk in parser_chunks:
    for raw in parser['outputs'][chunk]['inputs']:
        p = raw.replace('\\', '/')
        if p.startswith('src/'):
            groups['parser'].add(p)
        elif '/node_modules/' not in p:
            raise SystemExit('unclassified parser input')
generated_expected = {'src/language/generated/ast.ts', 'src/language/generated/grammar.ts', 'src/language/generated/module.ts'}
result = []
with tarfile.open(archive, 'r:gz') as source_tar:
    members = {m.name: m for m in source_tar if m.isfile()}
    for name, files in groups.items():
        matched = 0
        generated = []
        for item in sorted(files):
            physical = item.split('?')[0]
            if '..' in Path(physical).parts:
                raise SystemExit('unsafe path')
            local = (root / 'packages' / name / physical).read_bytes()
            member = f'mermaid-{commit}/packages/{name}/{physical}'
            if member not in members:
                if name != 'parser' or physical not in generated_expected:
                    raise SystemExit('unexpected missing source')
                generated.append({'path': physical, 'sha256': sha(local)})
                continue
            if source_tar.extractfile(members[member]).read() != local:
                raise SystemExit('source mismatch')
            matched += 1
        if name == 'parser' and {x['path'] for x in generated} != generated_expected:
            raise SystemExit('unexpected generated sources')
        result.append({'name': name, 'contributingInputs': len(files), 'sourceTarMatches': matched, 'generated': generated})
evidence = {'sourceCommit': commit, 'sourceTarSha256': sha(archive_bytes), 'inventorySha256': sha(inventory_bytes), 'workspaces': result, 'limitations': 'Byte identity for source inputs only; generated parser files are hash-recorded, not sourced from the tar; legal completeness requires separate review.'}
with output.open('x', encoding='utf-8', newline='\n') as stream:
    json.dump(evidence, stream, ensure_ascii=False, indent=2)
    stream.write('\n')
print(json.dumps([{'name': x['name'], 'matched': x['sourceTarMatches'], 'generated': len(x['generated'])} for x in result]))
