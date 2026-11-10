import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,rm,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {verifyTinySnapshot} from './tiny-materials.mjs';
import {readTinyRelease,verifyTinyRuntime,verifyTinyAuditBinding,digest} from './tiny-release.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=resolve(root,'tmp');
// Fresh checkouts have no ignored scratch directory; establish it before mkdtemp.
await mkdir(scratch,{recursive:true});
test('Tiny snapshot preserves originals and rejects changed or extra materials',async()=>{
  const valid=await verifyTinySnapshot();assert.equal(valid.record.version,'12.3.0');assert.equal(valid.files.length,75);assert.equal(valid.manifest.items.length,69);
  assert.ok(valid.manifest.items.some(i=>i.name==='@babel/helpers'&&i.version==='7.29.10'));
  const directory=await mkdtemp(resolve(scratch,'tiny-snapshot-test-'));
  try{
    await cp(new URL('../'+valid.release.snapshotDirectory,import.meta.url),directory,{recursive:true});
    const url=pathToFileURL(directory+sep);
    await verifyTinySnapshot(url);
    await rm(resolve(directory,'original-067-0.txt')); // New helper must not disappear.
    await assert.rejects(verifyTinySnapshot(url),/file inventory/);
    await cp(new URL('../'+valid.release.snapshotDirectory+'original-067-0.txt',import.meta.url),resolve(directory,'original-067-0.txt'));
    await writeFile(resolve(directory,'original-000-0.txt'),'synthetic different original');
    await assert.rejects(verifyTinySnapshot(url),/hash mismatch/);
    await writeFile(resolve(directory,'unexpected.txt'),'extra');
    await assert.rejects(verifyTinySnapshot(url),/file inventory/);
  }finally{
    const checked=resolve(directory);if(!checked.startsWith(scratch+sep)||!checked.includes('tiny-snapshot-test-'))throw Error('unsafe test cleanup');
    await rm(checked,{recursive:true,force:true});
  }
});

test('The default advisory gate binds declared, locked, installed and actual bundle identities before network access',async()=>{
  const active=await readTinyRelease();assert.equal(active.version,'12.3.0');assert.equal(active.auditTargets,67);
  const directory=await mkdtemp(resolve(scratch,'tiny-runtime-test-'));
  try{
    const bytes=Buffer.from('synthetic fixed runtime');
    const release={...active,bundleSha256:digest(bytes),bundleBytes:bytes.length};
    await mkdir(resolve(directory,'node_modules/@mermaid-js/tiny/dist'),{recursive:true});
    const url=pathToFileURL(directory+sep);
    const declaration=version=>writeFile(resolve(directory,'package.json'),JSON.stringify({dependencies:{'@mermaid-js/tiny':version}}));
    const lock=integrity=>writeFile(resolve(directory,'package-lock.json'),JSON.stringify({packages:{'node_modules/@mermaid-js/tiny':{version:active.version,integrity}}}));
    const installed=version=>writeFile(resolve(directory,'node_modules/@mermaid-js/tiny/package.json'),JSON.stringify({name:active.name,version}));
    await declaration(active.version);await lock(active.packageIntegrity);await installed(active.version);
    const bundle=resolve(directory,'node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js');await writeFile(bundle,bytes);
    await verifyTinyRuntime(release,url);
    await declaration('12.2.0');await assert.rejects(verifyTinyRuntime(release,url),/version mismatch/);await declaration(active.version);
    await installed('12.2.0');await assert.rejects(verifyTinyRuntime(release,url),/version mismatch/);await installed(active.version);
    await lock('different-integrity');await assert.rejects(verifyTinyRuntime(release,url),/integrity mismatch/);await lock(active.packageIntegrity);
    await writeFile(bundle,'modified runtime');await assert.rejects(verifyTinyRuntime(release,url),/bundle mismatch/);
    const inv=Buffer.from(JSON.stringify({bundleSha256:active.bundleSha256,sourceCommit:active.sourceCommit,packages:Array.from({length:67},()=>({}))})),plan=Buffer.from(JSON.stringify({sourceCommit:active.sourceCommit}));
    const binding={...active,auditScopeSha256:digest(inv),auditPlanSha256:digest(plan)};
    verifyTinyAuditBinding(binding,inv,plan);
    assert.throws(()=>verifyTinyAuditBinding(binding,Buffer.from('{}'),plan),/data mismatch/);
    assert.throws(()=>verifyTinyAuditBinding({...binding,sourceCommit:'0'.repeat(40)},inv,plan),/identity mismatch/);
  }finally{
    const checked=resolve(directory);if(!checked.startsWith(scratch+sep)||!checked.includes('tiny-runtime-test-'))throw Error('unsafe test cleanup');
    await rm(checked,{recursive:true,force:true});
  }
});
