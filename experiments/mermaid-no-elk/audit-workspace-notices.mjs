import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [rootArg,inventoryPath,outPath]=process.argv.slice(2);
if(!rootArg||!inventoryPath||!outPath)throw Error('usage: node audit-workspace-notices.mjs UPSTREAM_ROOT INVENTORY OUTPUT');
const root=path.resolve(rootArg),sha=b=>createHash('sha256').update(b).digest('hex');
const [tinyBytes,parserBytes,inventoryBytes]=await Promise.all(['stats/mermaid.tiny.min.js.meta.json','stats/parser-core-inspect.json',inventoryPath].map((p,i)=>readFile(i===2?p:path.join(root,p))));
const inventory=JSON.parse(inventoryBytes),tiny=JSON.parse(tinyBytes),parser=JSON.parse(parserBytes);
if(sha(tinyBytes)!==inventory.tinyMetafileSha256||sha(parserBytes)!==inventory.parserMetafileSha256)throw Error('metafile mismatch');
const out=Object.values(tiny.outputs);if(out.length!==1)throw Error('invalid tiny outputs');
const inputs=Object.keys(out[0].inputs).map(p=>p.replaceAll('\\','/'));
const parserOutputs=inputs.filter(p=>p.startsWith('../parser/dist/')).map(p=>p.slice('../parser/'.length));
if(parserOutputs.length!==inventory.parserChunksUsed)throw Error('parser count mismatch');
const mermaid=new Set(inputs.filter(p=>p.startsWith('src/'))),parserSources=new Set();
for(const output of parserOutputs){
  const metadata=parser.outputs[output];if(!metadata)throw Error('parser output missing');
  for(const raw of Object.keys(metadata.inputs)){
    const source=raw.replaceAll('\\','/');
    if(source.startsWith('src/'))parserSources.add(source);
    else if(!source.includes('/node_modules/'))throw Error('unclassified parser input');
  }
}
const workspaces=[];
for(const [name,files] of [['mermaid',mermaid],['parser',parserSources]]){
  const marked=[];
  for(const relative of [...files].sort()){
    if(relative.split('/').includes('..'))throw Error('unsafe path');
    const physical=relative.split('?')[0];
    const bytes=await readFile(path.join(root,'packages',name,physical));const text=bytes.toString('utf8');
    const copyright=(text.match(/\bcopyright\b|\(c\)\s*\d{4}|©\s*\d{4}/gi)||[]).length,spdx=(text.match(/SPDX-License-Identifier\s*:/gi)||[]).length,license=(text.match(/@license\b|\bMIT licen[cs]e\b/gi)||[]).length,attribution=(text.match(/based on[^\n]*https?:\/\//gi)||[]).length;
    if(copyright||spdx||license||attribution)marked.push({path:relative,physical,sha256:sha(bytes),copyright,spdx,license,attribution,generated:relative.startsWith('src/language/generated/'),virtual:relative!==physical});
  }
  const rootEntries=await readdir(path.join(root,'packages',name),{withFileTypes:true});
  const rootNoticeFiles=[];
  for(const entry of rootEntries){
    if(!entry.isFile()||!/^(notice|copyright|licen[cs]e|third[-_]?party(?:[-_](?:licenses|notices))?)(?:[._-].*)?$/i.test(entry.name))continue;
    const bytes=await readFile(path.join(root,'packages',name,entry.name));rootNoticeFiles.push({path:entry.name,sha256:sha(bytes),bytes:bytes.length});
  }
  workspaces.push({name,contributingFiles:files.size,generatedSources:[...files].filter(p=>p.startsWith('src/language/generated/')).length,markedFiles:marked,rootNoticeFiles});
}
const result={sourceCommit:inventory.sourceCommit,bundleSha256:inventory.bundleSha256,inventorySha256:sha(inventoryBytes),tinyMetafileSha256:sha(tinyBytes),parserMetafileSha256:sha(parserBytes),workspaces,limitations:'Markers in contributing workspace files and root-level notice names only. Does not establish complete third-party attribution, source provenance of generated grammars or legal compliance.'};
await writeFile(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(workspaces.map(w=>({name:w.name,files:w.contributingFiles,generated:w.generatedSources,marked:w.markedFiles.length,rootNoticeFiles:w.rootNoticeFiles.map(n=>n.path)}))));
