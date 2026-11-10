"""Fetch fixed primary-source candidates and record comparisons without publishing them."""
import difflib
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('usage: trace-source-origins.py LOCAL_RESEARCH_DIR EVIDENCE_OUTPUT')
directory, output = map(Path, sys.argv[1:])
directory.mkdir(parents=True, exist_ok=True)
sources = {
    'sequence-upstream.jison': 'https://raw.githubusercontent.com/bramp/js-sequence-diagrams/27c7a2b4fcb7b3366b9e371fde18911e08b13054/src/grammar.jison',
    'sequence-BSD.txt': 'https://raw.githubusercontent.com/bramp/js-sequence-diagrams/27c7a2b4fcb7b3366b9e371fde18911e08b13054/LICENCE',
    'mermaid-import.jison': 'https://raw.githubusercontent.com/mermaid-js/mermaid/2a0a2a2269545a26abf20c92de65f214eea5a425/src/parser/js-sequence-diagram.jison',
    'jekyll-document.rb': 'https://raw.githubusercontent.com/jekyll/jekyll/6dd3cc21c40b98054851846425af06c64f9fb466/lib/jekyll/document.rb',
    'jekyll-MIT.txt': 'https://raw.githubusercontent.com/jekyll/jekyll/6dd3cc21c40b98054851846425af06c64f9fb466/LICENSE',
    'mermaid-regexes.ts': 'https://raw.githubusercontent.com/mermaid-js/mermaid/1fb7869866dd619168d840291c9c54b4f129758b/packages/mermaid/src/diagram-api/regexes.ts',
}
data, records = {}, []
for name, url in sources.items():
    request = urllib.request.Request(url, headers={'User-Agent': 'local-license-research'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(1000001)
    if len(body) > 1000000:
        raise SystemExit('oversized source')
    text = body.decode('utf-8')
    data[name] = text
    target = directory / name
    if target.exists() and target.read_bytes() != body:
        raise SystemExit('existing source differs')
    target.write_bytes(body)
    records.append({'name': name, 'url': url, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
if '2012-2013, Andrew Brampton' not in data['sequence-BSD.txt']:
    raise SystemExit('unexpected sequence original')
if '2008-2016 Tom Preston-Werner' not in data['jekyll-MIT.txt']:
    raise SystemExit('unexpected jekyll original')
matcher = difflib.SequenceMatcher(None, data['sequence-upstream.jison'].splitlines(), data['mermaid-import.jison'].splitlines(), autojunk=False)
changes = [{'kind': tag, 'upstreamLines': [a+1,b], 'importLines': [c+1,d]} for tag,a,b,c,d in matcher.get_opcodes() if tag != 'equal']
jekyll = next(line.strip() for line in data['jekyll-document.rb'].splitlines() if 'YAML_FRONT_MATTER_REGEXP =' in line)
mermaid = next(line.strip() for line in data['mermaid-regexes.ts'].splitlines() if 'export const frontMatterRegex =' in line)
evidence = {'sources': records,
 'sequence': {'sourceCandidateCommit': '27c7a2b4fcb7b3366b9e371fde18911e08b13054', 'mermaidImportCommit': '2a0a2a2269545a26abf20c92de65f214eea5a425', 'changes': changes, 'equalLineBlocks': sum(1 for tag,*_ in matcher.get_opcodes() if tag=='equal'), 'licenseCandidate': 'BSD-2-Clause with 2012-2013 copyright', 'limitations': 'Fixed upstream grammar is a candidate base for the adapted import; unique historical checkout or tag is not proven.'},
 'jekyll': {'sourceCommit': '6dd3cc21c40b98054851846425af06c64f9fb466', 'sourceExpression': jekyll, 'mermaidExpression': mermaid, 'changes': ['Ruby beginning anchor to JavaScript beginning anchor and capture of indentation', 'delimiter handling changed from --- or ... to --- closing with same indentation', 'newline handling and captured content changed', 'Ruby multiline mode replaced with JavaScript dotAll mode'], 'license': 'MIT; retain source copyright and permission notice as conservative provision candidate'},
 'limitations': 'Source comparison and original candidates; legal substantiality and exact originating revision remain separate judgments.'}
with output.open('x', encoding='utf-8', newline='\n') as stream:
    json.dump(evidence, stream, ensure_ascii=False, indent=2)
    stream.write('\n')
print(json.dumps({'fixedSources':len(records),'sequenceChangeBlocks':len(changes),'jekyllExpressionsRecorded':True}))
