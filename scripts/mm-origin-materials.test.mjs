import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyMmOriginMaterials} from './mm-origin-materials.mjs';
test('Initial MM references keep BSD and named authors; changed/missing materials and changed WASM fail',async()=>{
  const root=new URL('../',import.meta.url),parent=resolve('tmp');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(parent+sep+'mm-origin-test-'),project=pathToFileURL(dir+sep);
  try{
    const original=await verifyMmOriginMaterials();assert.equal(original.files.length,2);
    assert.match(original.files[0].bytes.toString(),/Redistribution and use in source and binary forms/);
    assert.match(original.files[1].bytes.toString(),/Foxit Software Inc/);assert.match(original.files[1].bytes.toString(),/Google Inc/);
    const wasmPath='node_modules/@embedpdf/pdfium/dist/pdfium.wasm';
    for(const p of [...original.files.map(f=>f.source),wasmPath]){const target=new URL(p,project);await mkdir(new URL('.',target),{recursive:true});await copyFile(new URL(p,root),target);}
    await verifyMmOriginMaterials(project);
    const material=new URL(original.files[0].source,project);await writeFile(material,'short');await assert.rejects(verifyMmOriginMaterials(project),/material mismatch/);
    await writeFile(material,original.files[0].bytes);await rm(material);await assert.rejects(verifyMmOriginMaterials(project));await writeFile(material,original.files[0].bytes);
    const wasm=new URL(wasmPath,project),bytes=await readFile(wasm);bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);await assert.rejects(verifyMmOriginMaterials(project),/WASM mismatch/);
    bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);await verifyMmOriginMaterials(project);
  }finally{assert.ok(resolve(dir).startsWith(parent+sep));await rm(dir,{recursive:true,force:true});}
});
