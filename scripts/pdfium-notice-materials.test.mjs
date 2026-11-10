import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyPdfiumNoticeMaterials} from './pdfium-notice-materials.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=resolve(root,'tmp');
test('PDFium candidates keep complete fixed originals and labelled credit drafts; wrong or missing material fails',async()=>{
  await mkdir(scratch,{recursive:true});const valid=await verifyPdfiumNoticeMaterials();
  assert.equal(valid.record.originalCount,9);assert.equal(valid.files.length,10);
  const cpu=valid.files.find(f=>f.outputPath==='pdfium-candidates/cpu_features/LICENSE.txt').bytes.toString();
  assert.ok(cpu.includes('Apache License')&&cpu.includes('Copyright (C) 2010 The Android Open Source Project'));
  assert.ok(valid.files.find(f=>f.outputPath.endsWith('LICENSE-Apache2-LLVM.txt')).bytes.toString().includes('LLVM'));
  assert.ok(valid.files.find(f=>f.outputPath.endsWith('CANDIDATE-CREDITS.txt')).bytes.toString().includes('not a verified list'));
  const directory=await mkdtemp(resolve(scratch,'pdfium-notice-test-')),url=pathToFileURL(directory+sep);
  try{
    await cp(resolve(root,'package-lock.json'),resolve(directory,'package-lock.json'));
    const packagePath=resolve(directory,'node_modules/@embedpdf/pdfium/package.json');await mkdir(dirname(packagePath),{recursive:true});
    const pkg=await readFile(resolve(root,'node_modules/@embedpdf/pdfium/package.json'));await writeFile(packagePath,pkg);
    await assert.rejects(verifyPdfiumNoticeMaterials(url),{code:'ENOENT'});
    for(const file of valid.files){const path=resolve(directory,file.source);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.bytes);}
    await verifyPdfiumNoticeMaterials(url);
    const file=valid.files[0];await writeFile(resolve(directory,file.source),'synthetic incomplete license');await assert.rejects(verifyPdfiumNoticeMaterials(url),/hash mismatch/);await writeFile(resolve(directory,file.source),file.bytes);
    await writeFile(packagePath,JSON.stringify({...JSON.parse(pkg),version:'2.14.3'}));await assert.rejects(verifyPdfiumNoticeMaterials(url),/wrapper mismatch/);await writeFile(packagePath,pkg);
    await verifyPdfiumNoticeMaterials(url);
  }finally{
    const checked=resolve(directory);if(!checked.startsWith(scratch+sep)||!checked.includes('pdfium-notice-test-'))throw Error('unsafe cleanup');
    await rm(checked,{recursive:true,force:true});
  }
});
