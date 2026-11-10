import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyInternalNotices} from './internal-notices.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=resolve(root,'tmp');
test('Internal rights materials keep their fixed sources; missing, changed or wrong-version evidence cannot pass',async()=>{
  await mkdir(scratch,{recursive:true});const valid=await verifyInternalNotices();
  assert.equal(valid.record.sourceFiles.length,15);assert.equal(valid.files.length,2);
  const directory=await mkdtemp(resolve(scratch,'internal-notice-test-')),url=pathToFileURL(directory+sep);
  try{
    await mkdir(resolve(directory,'node_modules'),{recursive:true});
    await cp(resolve(root,'node_modules/pdf-lib'),resolve(directory,'node_modules/pdf-lib'),{recursive:true});
    await cp(resolve(root,'package-lock.json'),resolve(directory,'package-lock.json'));
    await assert.rejects(verifyInternalNotices(url),{code:'ENOENT'});
    for(const file of valid.files){const path=resolve(directory,file.source);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.bytes);}
    await verifyInternalNotices(url);
    const material=valid.files[0];await writeFile(resolve(directory,material.source),'synthetic altered rights');
    await assert.rejects(verifyInternalNotices(url),/material mismatch/);await writeFile(resolve(directory,material.source),material.bytes);
    const source=resolve(directory,'node_modules/pdf-lib/'+valid.record.sourceFiles[0].path),before=await readFile(source);
    await writeFile(source,'synthetic source without notice');await assert.rejects(verifyInternalNotices(url),/source mismatch/);await writeFile(source,before);
    const path=resolve(directory,'node_modules/pdf-lib/package.json'),pkg=JSON.parse(await readFile(path));
    await writeFile(path,JSON.stringify({...pkg,version:'1.17.0'}));await assert.rejects(verifyInternalNotices(url),/version\/integrity/);await writeFile(path,JSON.stringify(pkg));
    await verifyInternalNotices(url);
  }finally{
    const checked=resolve(directory);if(!checked.startsWith(scratch+sep)||!checked.includes('internal-notice-test-'))throw Error('unsafe cleanup');
    await rm(checked,{recursive:true,force:true});
  }
});
