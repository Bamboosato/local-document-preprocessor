import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,sep} from 'node:path';
import {verifyWasmDataMaterials} from './wasm-data-materials.mjs';
test('Exact WASM data and full Adobe/Foxit notices are required; changed or missing bytes fail',async()=>{
  const root=new URL('../',import.meta.url),parent=resolve('tmp');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(parent+sep+'wasm-data-test-'),project=pathToFileURL(dir+sep);
  try{
    const originals=await verifyWasmDataMaterials();assert.equal(originals.files.length,3);
    const adobe=originals.files[0];assert.match(adobe.bytes.toString(),/Redistributions in binary form/);assert.match(adobe.bytes.toString(),/Neither the name of Adobe/);
    assert.match(originals.files[1].bytes.toString(),/Original code copyright 2014 Foxit/);
    assert.match(originals.files[2].bytes.toString(),/Copyright \(c\) 1990-1994 Adobe Systems Incorporated/);
    assert.match(originals.files[2].label,/許諾条件確認中/);
    const paths=[...originals.files.map(f=>f.source),'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm','node_modules/@embedpdf/pdfium/dist/pdfium.wasm'];
    for(const p of paths){const target=new URL(p,project);await mkdir(new URL('.',target),{recursive:true});await copyFile(new URL(p,root),target);}
    await verifyWasmDataMaterials(project);
    const notice=new URL(adobe.source,project);await writeFile(notice,'shortened');await assert.rejects(verifyWasmDataMaterials(project),/notice hash mismatch/);
    await writeFile(notice,adobe.bytes);
    // Select the binary by path so adding a notice cannot change this test's target.
    const wasm=new URL('node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm',project),bytes=await readFile(wasm);bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);await assert.rejects(verifyWasmDataMaterials(project),/binary mismatch/);
    bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);await rm(notice);await assert.rejects(verifyWasmDataMaterials(project));
    await writeFile(notice,adobe.bytes);await verifyWasmDataMaterials(project);
  }finally{assert.ok(resolve(dir).startsWith(parent+sep));await rm(dir,{recursive:true,force:true});}
});
