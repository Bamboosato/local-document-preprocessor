import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyDistributionConditionMaterials} from './distribution-condition-materials.mjs';
test('All fixed condition units retain originals/credits; omissions, changes and wrong WASM fail without legal approval',async()=>{
  const root=new URL('../',import.meta.url),parent=resolve('tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(parent+sep+'condition-test-'),project=pathToFileURL(dir+sep);
  try{
    const original=await verifyDistributionConditionMaterials();assert.equal(original.record.units.length,119);assert.equal(original.files.length,229);assert.equal(original.record.releaseApproval,false);
    assert.match(original.files.at(-1).content.toString(),/work of the FreeType Team/);assert.match(original.files.at(-1).content.toString(),/Independent JPEG Group/);
    const recordPath='docs/evidence/distribution-closeout-assessment.json';
    const paths=[recordPath,...Object.keys(original.record.inputsSha256CanonicalLF),...original.files.map(f=>f.source),'package-lock.json','node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm','node_modules/@embedpdf/pdfium/dist/pdfium.wasm'];
    for(const p of new Set(paths)){const target=new URL(p,project);await mkdir(new URL('.',target),{recursive:true});await copyFile(new URL(p,root),target);}
    await verifyDistributionConditionMaterials(project);
    const material=new URL(original.files[0].source,project);await writeFile(material,'changed');await assert.rejects(verifyDistributionConditionMaterials(project),/condition material/);await writeFile(material,original.files[0].content);
    await rm(material);await assert.rejects(verifyDistributionConditionMaterials(project));await writeFile(material,original.files[0].content);
    const record=new URL(recordPath,project);await writeFile(record,JSON.stringify({...original.record,units:original.record.units.slice(1)}));await assert.rejects(verifyDistributionConditionMaterials(project));await copyFile(new URL(recordPath,root),record);
    const wrongChoice=structuredClone(original.record);wrongChoice.units.find(u=>u.id==='anydoc/zlib-rs@0.6.6').declaredExpression='MIT';await writeFile(record,JSON.stringify(wrongChoice));await assert.rejects(verifyDistributionConditionMaterials(project),/condition declaration mismatch/);await copyFile(new URL(recordPath,root),record);
    const wasm=new URL('node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm',project),bytes=await readFile(wasm);bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);await assert.rejects(verifyDistributionConditionMaterials(project),/WASM bytes mismatch/);bytes[bytes.length-1]^=1;await writeFile(wasm,bytes);
    await verifyDistributionConditionMaterials(project);
  }finally{assert.ok(resolve(dir).startsWith(parent+sep));await rm(dir,{recursive:true,force:true});}
});
