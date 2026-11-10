import {readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [rootArg,inventoryPath,outPath]=process.argv.slice(2);
if(!rootArg||!inventoryPath||!outPath)throw Error('usage: node audit-bundle-notices.mjs UPSTREAM_ROOT INVENTORY OUTPUT');
const root=path.resolve(rootArg),sha=b=>createHash('sha256').update(b).digest('hex');
const [tinyBytes,parserBytes,invBytes]=await Promise.all(['stats/mermaid.tiny.min.js.meta.json','stats/parser-core-inspect.json',inventoryPath].map((p,i)=>readFile(i===2?p:path.join(root,p))));
const inventory=JSON.parse(invBytes),tiny=JSON.parse(tinyBytes),parser=JSON.parse(parserBytes);
if(sha(tinyBytes)!==inventory.tinyMetafileSha256||sha(parserBytes)!==inventory.parserMetafileSha256)throw Error('metafile mismatch');
const output=Object.values(tiny.outputs);if(output.length!==1)throw Error('unexpected output');
const tinyPaths=Object.keys(output[0].inputs);const parserPaths=tinyPaths.filter(p=>p.replaceAll('\\','/').startsWith('../parser/dist/')).map(p=>p.replaceAll('\\','/').slice('../parser/'.length));
if(parserPaths.length!==inventory.parserChunksUsed)throw Error('parser count mismatch');
const sources=tinyPaths.map(raw=>({raw,base:'mermaid'}));
for(const p of parserPaths){if(!parser.outputs[p])throw Error('missing parser');for(const raw of Object.keys(parser.outputs[p].inputs))sources.push({raw,base:'parser'});}
const groups=new Map();
for(const {raw,base} of sources){
  const normalized=raw.replaceAll('\\','/');if(!normalized.includes('/node_modules/'))continue;
  const match=normalized.match(/^(.*\/node_modules\/\.pnpm\/[^/]+\/node_modules\/(?:@[^/]+\/)?[^/]+)\/(.+)$/);
  if(!match)throw Error('unattributed source');
  const dir=await realpath(path.resolve(root,'packages',base,match[1]));
  const rel=path.relative(root,dir);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('outside root');
  const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));const key=pkg.name+'@'+pkg.version;
  if(!groups.has(key))groups.set(key,{name:pkg.name,version:pkg.version,dir,files:new Set()});
  groups.get(key).files.add(match[2]);
}
if(groups.size!==inventory.packages.length||inventory.packages.some(p=>!groups.has(p.name+'@'+p.version)))throw Error('package inventory mismatch');
async function noticeFiles(dir,prefix=''){
  const found=[];
  for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})){
    if(entry.isSymbolicLink()||entry.name==='node_modules'||entry.name==='.git')continue;
    const rel=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isDirectory())found.push(...await noticeFiles(dir,rel));
    else if(entry.isFile()&&/^(notice|copyright|licen[cs]e|third[-_]?party(?:[-_](?:licenses|notices))?)(?:[._-].*)?$/i.test(entry.name)){
      const bytes=await readFile(path.join(dir,rel));found.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});
    }
  }
  return found.sort((a,b)=>a.path.localeCompare(b.path));
}
const result=[];
for(const group of [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version))){
  const marked=[];
  for(const file of [...group.files].sort()){
    if(file.split('/').includes('..'))throw Error('unsafe source path');
    const bytes=await readFile(path.join(group.dir,file)),text=bytes.toString('utf8');
    const markers={copyright:(text.match(/\bcopyright\b/gi)||[]).length,spdx:(text.match(/SPDX-License-Identifier\s*:/gi)||[]).length,license:(text.match(/@license\b/gi)||[]).length};
    if(Object.values(markers).some(Boolean))marked.push({path:file,sha256:sha(bytes),...markers});
  }
  result.push({name:group.name,version:group.version,contributingFiles:group.files.size,markedFiles:marked,noticeFiles:await noticeFiles(group.dir)});
}
const audit={bundleSha256:inventory.bundleSha256,inventorySha256:sha(invBytes),tinyMetafileSha256:sha(tinyBytes),parserMetafileSha256:sha(parserBytes),packages:result,limitations:'Automated marker and notice filename search; misses unmarked attribution, generated workspace sources, semantic license obligations, symlink contents and release-time modifications. Manual review is required.'};
await writeFile(outPath,JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({packages:result.length,contributingFiles:result.reduce((n,p)=>n+p.contributingFiles,0),markedFiles:result.reduce((n,p)=>n+p.markedFiles.length,0),noticePackages:result.filter(p=>p.noticeFiles.some(f=>/notice|third[-_]?party/i.test(f.path))).map(p=>({name:p.name,version:p.version,files:p.noticeFiles.filter(f=>/notice|third[-_]?party/i.test(f.path)).map(f=>f.path)})),nestedLicensePackages:result.filter(p=>p.noticeFiles.some(f=>f.path.includes('/'))).map(p=>({name:p.name,version:p.version,files:p.noticeFiles.filter(f=>f.path.includes('/')).map(f=>f.path)}))}));
