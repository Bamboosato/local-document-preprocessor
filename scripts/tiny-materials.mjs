import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTinyRelease} from './tiny-release.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=new URL('../',import.meta.url);
export async function verifyTinySnapshot(directory){
  const release=await readTinyRelease();directory??=new URL(release.snapshotDirectory,root);
  const record=JSON.parse(await readFile(new URL(release.productRecord,root)));
  const reviewedBytes=await readFile(new URL(release.reviewedMaterials,root));
  if(sha(reviewedBytes)!==release.reviewedMaterialsSha256||record.reviewedMaterialRecordSha256!==release.reviewedMaterialsSha256||JSON.stringify(Object.entries(record.sourceAssetHashes).sort())!==JSON.stringify(Object.entries(JSON.parse(reviewedBytes).candidateAssetHashes).sort()))throw Error('tiny reviewed material binding mismatch');
  const inventoryBytes=await readFile(new URL(release.thirdPartyInventory,root)),inventory=JSON.parse(inventoryBytes);
  if(sha(inventoryBytes)!==release.thirdPartyInventorySha256||record.name!==release.name||record.version!==release.version||record.sourceCommit!==release.sourceCommit||record.bundleSha256!==release.bundleSha256||record.bundleSha256!==inventory.bundleSha256||record.files.length!==release.materialCount)throw Error('tiny snapshot identity mismatch');
  const names=record.files.map(f=>f.name).sort();
  if(new Set(names).size!==release.materialCount||names.some(n=>!/^(?:original-\d{3}-\d\.txt|source-notices\.txt|(?:fastdom|roughjs)\.patch\.txt|generator-license\.txt|index\.html|manifest\.json)$/.test(n)))throw Error('tiny snapshot paths');
  if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(names))throw Error('tiny snapshot file inventory');
  const files=[];
  for(const file of record.files){const bytes=await readFile(new URL(file.name,directory));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('tiny snapshot hash mismatch');files.push({...file,bytes});}
  const manifest=JSON.parse(files.find(f=>f.name==='manifest.json').bytes);
  const expected=Object.keys(record.sourceAssetHashes).filter(n=>n.startsWith('original-'));
  if(manifest.items.length!==release.originals||expected.length!==release.originals||new Set(manifest.items.map(i=>i.path)).size!==release.originals)throw Error('tiny original count');
  for(const item of [...manifest.items,manifest.sourceNotices,manifest.generatorReference,...manifest.patches]){
    if(!item.path.startsWith('/licenses/mermaid-tiny/'))throw Error('tiny manifest path');
    const name=item.path.slice('/licenses/mermaid-tiny/'.length),file=files.find(f=>f.name===name);
    if(!file||file.sha256!==item.sha256)throw Error('tiny manifest hash');
    if(sha(file.bytes)!==record.sourceAssetHashes[name])throw Error('tiny original bytes changed');
  }
  return {release,record,manifest,files};
}
export async function copyTinyMaterials(output){
  const result=await verifyTinySnapshot();
  const target=new URL('mermaid-tiny/',output);await mkdir(target,{recursive:true});
  for(const {name,bytes} of result.files)await writeFile(new URL(name,target),bytes);
  return {name:result.record.name,version:result.record.version,bundleSha256:result.record.bundleSha256,sourceCommit:result.record.sourceCommit,manifest:'mermaid-tiny/manifest.json',index:'mermaid-tiny/index.html'};
}
