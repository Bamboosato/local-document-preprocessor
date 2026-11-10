import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readTinyRelease(){
  const release=JSON.parse(await readFile(new URL('scripts/tiny-release.json',root)));
  if(release.schema!==1||release.name!=='@mermaid-js/tiny'||!/^\d+\.\d+\.\d+$/.test(release.version)||!/^[a-f0-9]{64}$/.test(release.bundleSha256)||!/^[a-f0-9]{40}$/.test(release.sourceCommit))throw Error('invalid active Tiny identity');
  for(const key of ['thirdPartyInventory','auditScope','auditPlan','reviewedMaterials','candidateDirectory','snapshotDirectory','productRecord']){
    const value=release[key];if(typeof value!=='string'||value.startsWith('/')||/[\\:]/.test(value)||value.split('/').some(p=>p==='..'||p==='.' ))throw Error('unsafe Tiny release path');
  }
  if(release.snapshotDirectory!==`docs/third-party-source-licenses/mermaid-tiny/${release.version}/`||!Number.isSafeInteger(release.originals)||release.originals<1||release.materialCount!==release.originals+6||!Number.isSafeInteger(release.auditTargets)||release.auditTargets<1)throw Error('invalid Tiny release counts');
  return release;
}
export async function verifyTinyRuntime(release,directory=root){
  const [pkg,lock,installed,bundle]=await Promise.all(['package.json','package-lock.json','node_modules/@mermaid-js/tiny/package.json','node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js'].map(name=>readFile(new URL(name,directory))));
  const declaration=JSON.parse(pkg).dependencies?.[release.name],entry=JSON.parse(lock).packages?.['node_modules/'+release.name],actual=JSON.parse(installed);
  if(declaration!==release.version||entry?.version!==release.version||actual.name!==release.name||actual.version!==release.version)throw Error('active Tiny version mismatch');
  if(entry.integrity!==release.packageIntegrity)throw Error('active Tiny integrity mismatch');
  if(bundle.length!==release.bundleBytes||digest(bundle)!==release.bundleSha256)throw Error('active Tiny bundle mismatch');
  return {version:release.version,sha256:release.bundleSha256,bytes:bundle.length};
}
export function verifyTinyAuditBinding(release,inventoryBytes,planBytes){
  if(digest(inventoryBytes)!==release.auditScopeSha256||digest(planBytes)!==release.auditPlanSha256)throw Error('active Tiny audit data mismatch');
  const inventory=JSON.parse(inventoryBytes),plan=JSON.parse(planBytes);
  if(inventory.bundleSha256!==release.bundleSha256||inventory.sourceCommit!==release.sourceCommit||plan.sourceCommit!==release.sourceCommit||inventory.packages.length!==release.auditTargets)throw Error('active Tiny audit identity mismatch');
}
