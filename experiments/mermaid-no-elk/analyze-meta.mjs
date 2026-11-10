import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [metaPath,rebuildPath,publishedPath,outPath,sourceCommit]=process.argv.slice(2);
if(!metaPath||!rebuildPath||!publishedPath||!outPath||!/^[a-f0-9]{40}$/.test(sourceCommit??''))throw Error('usage: node analyze-meta.mjs METAFILE REBUILT PUBLISHED OUTPUT SOURCE_COMMIT');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const [metaBytes,rebuild,published]=await Promise.all([metaPath,rebuildPath,publishedPath].map(p=>readFile(p)));
if(!rebuild.equals(published))throw Error('rebuild differs from published bytes');
const meta=JSON.parse(metaBytes),outputs=Object.values(meta.outputs);
if(outputs.length!==1)throw Error('unexpected output count');
const contributors=outputs[0].inputs;
const packages=new Map();
for(const [raw,info] of Object.entries(contributors)){
  const path=raw.replaceAll('\\','/');
  const match=path.match(/\/node_modules\/\.pnpm\/([^/]+)\/node_modules\/(?:@([^/]+)\/)?([^/]+)\//);
  if(!match)continue;
  const name=(match[2]?'@'+match[2]+'/':'')+match[3];
  const encoded=match[1].split('_')[0];
  const version=encoded.slice(encoded.lastIndexOf('@')+1);
  if(!version||!Number.isInteger(info.bytesInOutput)||info.bytesInOutput<=0)throw Error('invalid package data');
  const key=name+'@'+version;
  const item=packages.get(key)||{name,version,bytesInOutput:0,files:0};
  item.bytesInOutput+=info.bytesInOutput;item.files++;packages.set(key,item);
}
const elkInputs=Object.keys(meta.inputs).filter(p=>/elkjs/i.test(p));
const elkContributors=Object.entries(contributors).filter(([p])=>/elkjs/i.test(p));
const elkSource=Object.entries(contributors).filter(([p])=>p.replaceAll('\\','/').includes('/layout-algorithms/elk/')).map(([p,v])=>({source:p.replaceAll('\\','/'),bytesInOutput:v.bytesInOutput}));
const evidence={sourceCommit,rebuildSha256:sha(rebuild),publishedSha256:sha(published),metafileSha256:sha(metaBytes),metafileInputs:Object.keys(meta.inputs).length,outputContributors:Object.keys(contributors).length,elkjsResolvedInputs:elkInputs.length,elkjsOutputContributors:elkContributors.length,mermaidElkSourceContributors:elkSource,packages:[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version)),limitations:'Metafile records contributors to one rebuilt bundle; package attribution excludes workspace and bundled generated modules. Rebuild bytes match published bytes. License and generated-module attribution require separate review.'};
await writeFile(outPath,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sha256:evidence.rebuildSha256,packages:evidence.packages.length,elkjsResolvedInputs:evidence.elkjsResolvedInputs,elkjsOutputContributors:evidence.elkjsOutputContributors,mermaidElkSourceContributors:elkSource}));
