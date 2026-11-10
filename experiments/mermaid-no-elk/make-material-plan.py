"""Maintenance tool: freeze a minimal retrieval plan from already-reviewed upstream evidence.
Requires PyYAML only for plan maintenance; retrieval uses Python standard library only.
"""
import hashlib
import json
import sys
import tarfile
from pathlib import Path
import yaml
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('upstream', type=Path)
parser.add_argument('source_tar', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--prefix', default='mermaid-tiny')
parser.add_argument('--source-sha256', default='cc9efe255ea61aa2e991ea4c9c0c49f286b3f81e590fa58d04750723da758476')
parser.add_argument('--tiny-lock', type=Path)
args = parser.parse_args()
upstream, source_tar, output = args.upstream, args.source_tar, args.output
project = Path(__file__).resolve().parents[2]
evidence = project / 'docs/evidence'
load = lambda name: json.loads((evidence / name.replace('mermaid-tiny', args.prefix, 1)).read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
inventory = load('mermaid-tiny-license-inventory.json')
audit = load('mermaid-tiny-notice-audit.json')
workspace = load('mermaid-tiny-workspace-notice-audit.json')
lineage = load('mermaid-tiny-parser-lineage.json')
origins = load('mermaid-tiny-source-origins.json')
commit = inventory['sourceCommit']
if sha(source_tar.read_bytes()) != args.source_sha256:
    raise SystemExit('source tar mismatch')
with tarfile.open(source_tar) as archive:
    members = {m.name:m for m in archive if m.isfile()}
    lock_data = archive.extractfile(members[f'mermaid-{commit}/pnpm-lock.yaml']).read()
    if lock_data != (upstream / 'pnpm-lock.yaml').read_bytes():
        raise SystemExit('lock changed')
    lock = yaml.safe_load(lock_data)
    source_files = {}
    for item in inventory['workspace']:
        source_files[item['original']['path']] = item['original']['sha256']
    for group in workspace['workspaces']:
        for item in group['markedFiles']:
            source_files[f'packages/{group["name"]}/{item["physical"]}'] = item['sha256']
    for name, digest in [('fastdom.patch','10bad52c2ff6c742f43492850f2a5a74e9d70a33f42a442cdbda4e174356aa87'),('roughjs.patch','3543d47108cb41b68ec6a671c0e1f9d0cfe2ce524fea5b0992511ae84c3c6b64')]:
        source_files['patches/'+name] = digest
    source_records = []
    for name, digest in sorted(source_files.items()):
        body = archive.extractfile(members[f'mermaid-{commit}/{name}']).read()
        if sha(body) != digest:
            raise SystemExit('source evidence mismatch')
        source_records.append({'member':f'mermaid-{commit}/{name}','target':name,'bytes':len(body),'sha256':digest})

packages = []
for index, pkg in enumerate(inventory['packages']):
    identity = pkg['name']+'@'+pkg['version']
    prefix = pkg['name'].replace('/','+')+'@'+pkg['version']
    records = {f['name']:f['sha256'] for f in pkg['originals']}
    matching = [p for p in audit['packages'] if p['name']==pkg['name'] and p['version']==pkg['version']]
    if len(matching) != 1:
        raise SystemExit('notice evidence missing')
    for f in matching[0]['markedFiles']:
        records[f['path']] = f['sha256']
    candidates = sorted((upstream/'node_modules/.pnpm').glob(prefix+'*'))
    chosen = None
    for candidate in candidates:
        directory = candidate/'node_modules'/pkg['name']
        if all((directory/name).is_file() and sha((directory/name).read_bytes())==digest for name,digest in records.items()):
            chosen = directory
            break
    if chosen is None:
        raise SystemExit('installed materials do not match evidence: '+identity)
    target = f'npm/{index:03d}'
    files = [{'member':'package/package.json','target':target+'/package.json','identityOnly':True}]
    for name, digest in sorted(records.items()):
        files.append({'member':'package/'+name,'target':target+'/'+name,'sha256':digest,'bytes':(chosen/name).stat().st_size})
    integrity = lock['packages'][identity]['resolution']['integrity']
    packages.append({'name':pkg['name'],'version':pkg['version'],'patched':pkg['patched'],'materialDirectory':target,'url':f'https://registry.npmjs.org/{pkg["name"]}/-/{pkg["name"].split("/")[-1]}-{pkg["version"]}.tgz','integrity':integrity,'files':files})

generator = lineage['generator']
packages.append({'name':'langium-cli','version':'4.4.0','materialDirectory':'generator','role':'generator reference',
 'url':'https://registry.npmjs.org/langium-cli/-/langium-cli-4.4.0.tgz','integrity':lock['packages']['langium-cli@4.4.0']['resolution']['integrity'],
 'files':[{'member':'package/package.json','target':'generator/package.json','identityOnly':True},{'member':'package/LICENSE','target':'generator/LICENSE','sha256':generator['licenseSha256'],'bytes':(upstream/'node_modules/langium-cli/LICENSE').stat().st_size}]})
tiny_lock_path=args.tiny_lock or project/'experiments/mermaid-no-elk/package-lock.json'
tiny_lock=json.loads(tiny_lock_path.read_text(encoding='utf-8'))['packages']['node_modules/@mermaid-js/tiny']
tiny_bytes=(tiny_lock_path.parent/'node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js').read_bytes()
if sha(tiny_bytes)!=inventory['bundleSha256']:
    raise SystemExit('candidate Tiny lock/bundle mismatch')
packages.append({'name':'@mermaid-js/tiny','version':tiny_lock['version'],'materialDirectory':'tiny','role':'runtime bundle','url':tiny_lock['resolved'],'integrity':tiny_lock['integrity'],
 'files':[{'member':'package/package.json','target':'tiny/package.json','identityOnly':True},{'member':'package/dist/mermaid.tiny.js','target':'tiny/mermaid.tiny.js','sha256':inventory['bundleSha256'],'bytes':len(tiny_bytes)}]})
originals=[dict(x,target='origins/'+x['name']) for x in origins['sources'] if x['name'] in ('sequence-BSD.txt','jekyll-MIT.txt')]
tracked=['mermaid-tiny-license-inventory.json','mermaid-tiny-notice-audit.json','mermaid-tiny-workspace-notice-audit.json','mermaid-tiny-parser-lineage.json','mermaid-tiny-source-origins.json']
tracked=[name.replace('mermaid-tiny', args.prefix, 1) for name in tracked]
plan={'schema':1,'sourceCommit':commit,'upstreamLockSha256':sha(lock_data),'evidenceHashes':{n:sha((evidence/n).read_bytes()) for n in tracked},
 'source':{'url':f'https://codeload.github.com/mermaid-js/mermaid/tar.gz/{commit}','sha256':sha(source_tar.read_bytes()),'files':source_records},'npm':packages,'originals':originals,
 'notes':'Minimal research material snapshots, not executable patched dependencies. Package tarballs are pinned by upstream lock integrity; selected unchanged originals and source-notice files are pinned by reviewed hashes. No install scripts run.'}
with output.open('x',encoding='utf-8',newline='\n') as stream:
    json.dump(plan,stream,ensure_ascii=False,indent=2);stream.write('\n')
print(json.dumps({'npmTarballs':len(packages),'sourceFiles':len(source_records),'originOriginals':len(originals)}))
