import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const json=async(path,project)=>JSON.parse(await readFile(new URL(path,project)));
const key=o=>`${o.source??o.reviewPath}|${o.sha256}|${o.bytes}`;
export async function verifyDistributionConditionMaterials(project=root){
  const record=await json('docs/evidence/distribution-closeout-assessment.json',project),inputs={};
  for(const [path,digest] of Object.entries(record.inputsSha256CanonicalLF)){
    const bytes=await readFile(new URL(path,project));
    assert.equal(hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'))),digest,'condition source record mismatch');
    inputs[path.split('/').at(-1).replace('.json','')]=JSON.parse(bytes);
  }
  const expected=new Map(),anydoc=inputs['json-anydoc-target-licenses'],pdfium=inputs['json-pdfium-source-licenses'];
  for(const p of anydoc.packages)expected.set(`anydoc/${p.name}@${p.version}`,p.originals);
  expected.set('anydoc/workspace',anydoc.workspaceOriginals);
  const remaining=new Map(inputs['wasm-remaining-condition-review'].packages.map(p=>[p.name,p]));
  const previous=new Map(inputs['wasm-individual-condition-review'].packages.map(p=>[p.name,p]));
  const legacy=new Map(inputs['wasm-condition-dispositions'].legacySlashDispositions.map(p=>[p.name,p]));
  for(const p of anydoc.packages){
    const unit=record.units.find(u=>u.id===`anydoc/${p.name}@${p.version}`);assert.ok(unit,'condition unit missing');
    assert.equal(unit.declaredExpression,p.declaredLicense,'condition declaration mismatch');
    let choice=previous.get(p.name)?.preparationRecommendation??remaining.get(p.name)?.profile.preparationRecommendation;
    if(legacy.has(p.name))choice=legacy.get(p.name).preparationRecommendation;
    if(['fnv','rangemap'].includes(p.name))choice='prepare-both-MIT-and-Apache; declaration unchanged';
    assert.equal(unit.preparationChoice,choice,'condition choice mismatch');
  }
  for(const o of pdfium.originals){const parts=o.id.split('/'),id='pdfium/'+(parts[0]==='deps'?`deps/${parts[1]}`:parts[1]==='third_party'?`in-tree/${parts[2]}`:'root');if(!expected.has(id))expected.set(id,[]);expected.get(id).push(o);}
  for(const g of inputs['pdfium-notice-materials'].groups)if(['cpu_features','dragonbox','googletest'].includes(g.name))expected.set('pdfium/deps/'+g.name,g.files);
  assert.equal(record.releaseApproval,false,'preparation bundle is not public approval');
  assert.equal(record.units.length,119);assert.equal(expected.size,119);
  assert.equal(new Set(record.units.map(u=>u.id)).size,119);
  const files=[];
  for(const unit of record.units){
    assert.ok(expected.has(unit.id),'unexpected condition unit');
    assert.deepEqual(unit.materials.map(key).sort(),expected.get(unit.id).map(key).sort(),'condition original coverage mismatch');
    for(const item of unit.materials)files.push({...item,unit:unit.id});
  }
  assert.equal(files.length,228);files.push({...record.credits,unit:'distribution-credits'});
  assert.equal(new Set(files.map(f=>f.outputPath)).size,229);
  for(const f of files){
    assert.ok((f.source.startsWith('docs/third-party-source-licenses/')||f.source.startsWith('docs/third-party-wasm-notices/'))&&f.outputPath.startsWith('wasm-conditions/')&&![f.source,f.outputPath].some(p=>p.includes('..')||/[\\:]/.test(p)),'unsafe condition material path');
    const bytes=await readFile(new URL(f.source,project));assert.equal(bytes.length,f.bytes,'condition material size mismatch');assert.equal(hash(bytes),f.sha256,'condition material hash mismatch');f.content=bytes;
  }
  const lock=await json('package-lock.json',project);
  for(const p of record.wasm){
    assert.equal(lock.packages['node_modules/'+p.name]?.version,p.version,'condition WASM version mismatch');
    const path=p.name==='@firecrawl/anydoc-wasm'?'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm':'node_modules/@embedpdf/pdfium/dist/pdfium.wasm';
    const bytes=await readFile(new URL(path,project));assert.equal(hash(bytes),p.wasmSha256,'condition WASM bytes mismatch');assert.equal(bytes.length,p.wasmBytes);
  }
  return {record,files};
}
export async function copyDistributionConditionMaterials(output){
  const {record,files}=await verifyDistributionConditionMaterials();
  for(const f of files){const target=new URL(f.outputPath,output);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,f.content);}
  return {scope:record.scope,releaseApproval:false,units:record.units.map(({id,declaredExpression,preparationChoice,requirements,materials})=>({id,...(declaredExpression?{declaredExpression}:{}),preparationChoice,requirements,originals:materials.map(({outputPath,sha256,bytes,label})=>({path:outputPath,sha256,bytes,label}))})),credits:{path:record.credits.outputPath,sha256:record.credits.sha256,bytes:record.credits.bytes}};
}
