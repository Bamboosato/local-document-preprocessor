import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyPakoMaterials} from './pako-materials.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=resolve(root,'tmp');

test('Both pako licenses retain the exact published notice; missing/changed/versioned materials fail closed',async()=>{
  await mkdir(scratch,{recursive:true});
  const valid=await verifyPakoMaterials();assert.equal(valid.record.declaredLicense,'(MIT AND Zlib)');assert.equal(valid.record.sourceFiles.length,13);
  const directory=await mkdtemp(resolve(scratch,'pako-notice-test-')),url=pathToFileURL(directory+sep);
  try{
    await mkdir(resolve(directory,'node_modules'),{recursive:true});
    await cp(resolve(root,'node_modules/pako'),resolve(directory,'node_modules/pako'),{recursive:true});
    await cp(resolve(root,'package-lock.json'),resolve(directory,'package-lock.json'));
    const notice=resolve(directory,valid.record.noticeSnapshot);await mkdir(resolve(notice,'..'),{recursive:true});
    // Establish the absent-file premise before restoring the exact original.
    await assert.rejects(verifyPakoMaterials(url),{code:'ENOENT'});
    await writeFile(notice,valid.bytes);await verifyPakoMaterials(url);
    await writeFile(notice,'synthetic wrong notice');await assert.rejects(verifyPakoMaterials(url),/notice hash/);await writeFile(notice,valid.bytes);
    const pkgPath=resolve(directory,'node_modules/pako/package.json'),pkg=JSON.parse(await readFile(pkgPath));
    await writeFile(pkgPath,JSON.stringify({...pkg,version:'1.0.10'}));await assert.rejects(verifyPakoMaterials(url),/version\/integrity\/license/);await writeFile(pkgPath,JSON.stringify(pkg));
    const lockPath=resolve(directory,'package-lock.json'),lockedBytes=await readFile(lockPath),lock=JSON.parse(lockedBytes);
    lock.packages['node_modules/pako'].integrity='synthetic wrong integrity';await writeFile(lockPath,JSON.stringify(lock));
    await assert.rejects(verifyPakoMaterials(url),/version\/integrity\/license/);await writeFile(lockPath,lockedBytes);
    const source=resolve(directory,'node_modules/pako/lib/zlib/deflate.js'),before=await readFile(source);
    await writeFile(source,'synthetic source without original header');await assert.rejects(verifyPakoMaterials(url),/source hash/);await writeFile(source,before);
    const extra=resolve(directory,'node_modules/pako/lib/zlib/extra.js');await writeFile(extra,'synthetic extra source');await assert.rejects(verifyPakoMaterials(url),/source inventory/);await rm(extra);
    await verifyPakoMaterials(url);
  }finally{
    const checked=resolve(directory);if(!checked.startsWith(scratch+sep)||!checked.includes('pako-notice-test-'))throw Error('unsafe test cleanup');
    await rm(checked,{recursive:true,force:true});
  }
});
