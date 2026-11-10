import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [rootArg,attributionPath,outPath]=process.argv.slice(2);
if(!rootArg||!attributionPath||!outPath)throw Error('usage: node inventory-bundle-licenses.mjs UPSTREAM_ROOT ATTRIBUTION OUTPUT');
const root=path.resolve(rootArg),sha=b=>createHash('sha256').update(b).digest('hex');
const [tinyMetaBytes,parserMetaBytes,hashBytes,recordBytes]=await Promise.all([
  'stats/mermaid.tiny.min.js.meta.json','stats/parser-core-inspect.json','stats/parser-core-hashes.json',attributionPath
].map((p,i)=>readFile(i===3?p:path.join(root,p))));
const tiny=JSON.parse(tinyMetaBytes),parser=JSON.parse(parserMetaBytes),record=JSON.parse(recordBytes);
const parserHashes=JSON.parse(hashBytes);
if(sha(tinyMetaBytes)!==record.metafileSha256)throw Error('attribution metafile mismatch');
const rebuilt=await readFile(path.join(root,'packages/tiny/dist/mermaid.tiny.js'));
if(sha(rebuilt)!==record.publishedSha256)throw Error('bundle mismatch');
const output=Object.values(tiny.outputs);if(output.length!==1)throw Error('invalid tiny outputs');
const tinyInputs=Object.keys(output[0].inputs);
const parserFiles=tinyInputs.filter(p=>p.replaceAll('\\','/').startsWith('../parser/dist/')).map(p=>p.replaceAll('\\','/').slice('../parser/'.length));
if(!parserFiles.length||new Set(parserFiles).size!==parserFiles.length)throw Error('parser input missing/duplicate');
const combined=[];
for(const raw of tinyInputs)combined.push({raw,base:'mermaid',stage:'tiny'});
for(const file of parserFiles){
  const item=parser.outputs[file];if(!item)throw Error('parser output absent: '+file);
  const existing=await readFile(path.join(root,'packages/parser',file));
  if(existing.length!==item.bytes||sha(existing)!==parserHashes[file])throw Error('parser output hash mismatch');
  for(const raw of Object.keys(item.inputs))combined.push({raw,base:'parser',stage:'parser'});
}
const packages=new Map(),unknown=new Set();
for(const {raw,base,stage} of combined){
  const norm=raw.replaceAll('\\','/');
  if(!norm.includes('/node_modules/'))continue;
  const match=norm.match(/^(.*\/node_modules\/\.pnpm\/[^/]+\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if(!match){unknown.add(norm);continue;}
  const dir=path.resolve(root,'packages',base,match[1]);
  const resolved=await realpath(dir),within=path.relative(root,resolved);
  if(within.startsWith('..')||path.isAbsolute(within))throw Error('dependency escaped isolated root');
  const pkg=JSON.parse(await readFile(path.join(resolved,'package.json'),'utf8'));
  if(!pkg.name||!pkg.version)throw Error('package identity missing');
  const key=pkg.name+'@'+pkg.version;let item=packages.get(key);
  if(!item){
    const entries=await readdir(resolved,{withFileTypes:true});
    const files=[];
    for(const entry of entries){
      if(!entry.isFile()||!/^(licen[cs]e|copying|copyright|notice)([._-].*)?$/i.test(entry.name))continue;
      const bytes=await readFile(path.join(resolved,entry.name));files.push({name:entry.name,bytes:bytes.length,sha256:sha(bytes)});
    }
    if(pkg.name==='fastdom'&&pkg.version==='1.0.12'&&!files.length){
      const readme=await readFile(path.join(resolved,'README.md'));
      if(!/## License\s+\(The MIT License\)/i.test(readme.toString('utf8')))throw Error('fastdom README license missing');
      files.push({name:'README.md',bytes:readme.length,sha256:sha(readme),note:'MIT license section; preserve attribution'});
    }
    files.sort((a,b)=>a.name.localeCompare(b.name));
    item={name:pkg.name,version:pkg.version,declaredLicense:pkg.license??null,originals:files,stages:[],patched:match[1].includes('_patch_hash=')};packages.set(key,item);
  }
  if(!item.stages.includes(stage))item.stages.push(stage);
}
if(unknown.size)throw Error('unattributed node_modules paths: '+unknown.size);
for(const p of record.packages)if(!packages.has(p.name+'@'+p.version))throw Error('previous contributor missing: '+p.name);
const workspace=[];
for(const name of ['mermaid','parser']){
  const pkg=JSON.parse(await readFile(path.join(root,'packages',name,'package.json'),'utf8'));
  const originalPath=name==='mermaid'?'LICENSE':'packages/parser/LICENSE';
  const original=await readFile(path.join(root,originalPath));
  workspace.push({name:pkg.name,version:pkg.version,declaredLicense:pkg.license??null,role:name,original:{path:originalPath,bytes:original.length,sha256:sha(original)}});
}
const list=[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const result={sourceCommit:record.sourceCommit,bundleSha256:record.publishedSha256,tinyMetafileSha256:sha(tinyMetaBytes),parserMetafileSha256:sha(parserMetaBytes),parserHashesSha256:sha(hashBytes),parserChunksUsed:parserFiles.length,workspace,packages:list,limitations:'Source metadata and root-level original candidates only; not final legal applicability, original attribution, notices within sources, or a complete independently verified SBOM.'};
await writeFile(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({packages:list.length,parserChunks:parserFiles.length,missingOriginals:list.filter(p=>!p.originals.length).map(p=>p.name+'@'+p.version),licenses:[...new Set(list.map(p=>p.declaredLicense))],patched:list.filter(p=>p.patched).map(p=>p.name+'@'+p.version),workspace}));
