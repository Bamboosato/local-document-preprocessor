import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.argv[2];if(!output)throw Error('usage: node check-prepared-materials.mjs OUTPUT');
const root=new URL('./dist/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const inventoryBytes=await readFile(new URL('../../docs/evidence/mermaid-tiny-license-inventory.json',import.meta.url));
const inventory=JSON.parse(inventoryBytes);
const manifest=JSON.parse(await readFile(new URL('licenses/manifest.json',root),'utf8'));
const clauses={MIT:['permission is hereby granted','copyright','without warranty'],ISC:['permission to use','copyright','as is'],'BSD-3-Clause':['redistribution and use','endorse','as is'],'Apache-2.0':['apache license','redistribution','notice']};
const records=[];
for(const pkg of inventory.packages){
  const items=manifest.items.filter(x=>x.name===pkg.name&&x.version===pkg.version);
  if(items.length!==pkg.originals.length)throw Error('original count mismatch');
  const texts=[];
  for(const item of items){
    if(!/^\/licenses\/original-\d{3}-\d\.txt$/.test(item.path))throw Error('unsafe prepared path');
    const bytes=await readFile(new URL(item.path.slice(1),root));
    const source=pkg.originals.find(x=>x.name===item.sourceName);
    if(!source||bytes.length!==source.bytes||sha(bytes)!==source.sha256||sha(bytes)!==item.sha256)throw Error('original bytes mismatch');
    texts.push(bytes.toString('utf8').toLowerCase());
  }
  const effective=pkg.name==='dompurify'?'Apache-2.0':pkg.declaredLicense??'MIT';
  if(!clauses[effective]||clauses[effective].some(marker=>!texts.join('\n').includes(marker)))throw Error('license content review needed: '+pkg.name);
  records.push({name:pkg.name,version:pkg.version,reviewedLicense:effective,originalCount:items.length,hashesMatch:true,clauseMarkersFound:true});
}
const references=[manifest.sourceNotices,manifest.generatorReference,...manifest.patches];
for(const item of references){
  if(!/^\/licenses\/[a-z.-]+\.txt$/.test(item.path))throw Error('unsafe reference path');
  const bytes=await readFile(new URL(item.path.slice(1),root));if(sha(bytes)!==item.sha256)throw Error('reference mismatch');
}
const result={bundleSha256:inventory.bundleSha256,inventorySha256:sha(inventoryBytes),preparedManifestSha256:sha(await readFile(new URL('licenses/manifest.json',root))),packages:records,referenceCount:references.length,generatorReference:manifest.generatorReference,limitations:'Hash and license-text marker checks only; semantic review, notices completeness and actual product distribution remain separate. No new legal approval is inferred.'};
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({packages:records.length,allHashesMatch:true,allClauseMarkersFound:true,references:references.length}));
