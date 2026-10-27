import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {sha256} from './distribution-research.mjs';
const project=new URL('../../',import.meta.url);
const readJSON=async path=>JSON.parse(await readFile(new URL(path,project),'utf8'));
const anydoc=await readJSON('docs/evidence/json-anydoc-target-licenses.json');
const elk=await readJSON('docs/evidence/json-elk-source-trace.json');
const pdf=await readJSON('docs/evidence/json-pdfium-source-licenses.json');
async function original(entry){
  assert.ok(entry.reviewPath.startsWith('docs/third-party-source-licenses/')&&!entry.reviewPath.includes('..'));
  const bytes=await readFile(new URL(entry.reviewPath,project));assert.equal(bytes.length,entry.bytes);assert.equal(sha256(bytes),entry.sha256);
}
test('SL-06: fixed WASM graph has 96 registry packages and excludes Node/Python workspace packages',async()=>{
  const previous=await readJSON('docs/evidence/json-distribution-source-records.json');
  assert.equal(anydoc.target,'wasm32-unknown-unknown');assert.deepEqual(anydoc.kinds,['normal','build']);assert.equal(anydoc.devDependencies,false);assert.equal(anydoc.packages.length,96);
  assert.match(anydoc.toolchain.image,/^rust@sha256:[a-f0-9]{64}$/);assert.match(anydoc.interpretation,/not an SBOM/);
  const keys=new Set();for(const p of anydoc.packages){const key=p.name+'@'+p.version;assert.ok(!keys.has(key));keys.add(key);assert.ok(!/^(napi|pyo3)/.test(p.name));const locked=previous.crates.find(c=>c.name===p.name&&c.version===p.version);assert.ok(locked);assert.equal(locked.checksum,p.checksum);assert.equal(p.archiveVerified,true);}
  assert.equal(anydoc.source.lockSha256,previous.sources.find(p=>p.id==='anydoc-lock').sha256);
});
test('SL-07: 195 anydoc originals retain exact bytes; two workspace fallbacks remain distinguishable',async()=>{
  assert.deepEqual(anydoc.missing,[]);const entries=[...anydoc.packages.flatMap(p=>p.originals),...anydoc.workspaceOriginals];assert.equal(entries.length,195);
  for(const entry of entries)await original(entry);
  const fallback=anydoc.packages.filter(p=>p.workspaceFallback);assert.equal(fallback.length,2);
  for(const p of fallback){assert.equal(p.workspaceFallback.commit,'d742c6fffce99ee89da91b934e7ce6fb2a82680c');assert.equal(p.originals[0].sourceKind,'pinned-workspace-repository');assert.ok(p.originals[0].sourceURL.includes(p.workspaceFallback.commit));}
});
test('SL-08: ELK source variant evidence never claims the exact publisher checkout',async()=>{
  assert.equal(elk.baseline.commit,'62d5909f96fad541bc101ad52dabaece6b7eab7e');assert.equal(elk.requiredPatch.commit,'7ca51784e42a24201f29bc13e458728b6fc61cdc');
  assert.equal(elk.baselineToPatch.runtimeFiles.length,2);assert.deepEqual(elk.patchToLatest.runtimeFiles,[]);assert.ok(elk.sourceChecks.every(p=>p.patchAndLatestEqual));
  assert.ok(Object.values(elk.generatedWorker.features).every(Boolean));assert.equal(elk.generatedWorker.sha256,sha256(await readFile(new URL('./node_modules/elkjs/lib/elk-worker.js',import.meta.url))));assert.match(elk.resolution,/not uniquely proven/);
  for(const entry of elk.originals)await original(entry);
});
test('SL-09: PDFium candidates and every committed original remain complete without implying binary coverage',async()=>{
  assert.equal(pdf.commit,'cb29e78f2ba00c9298714d5f4a8bf7765f1e802f');assert.match(pdf.scope,/not proof/);assert.equal(pdf.external.length,9);assert.equal(pdf.originals.length,29);
  for(const component of pdf.external){assert.match(component.revision,/^[a-f0-9]{40}$/);assert.ok(component.originalCount>0);assert.equal(component.inclusionInPublishedWASM,'not-proven');}
  for(const entry of pdf.originals)await original(entry);
  const expected=[...anydoc.packages.flatMap(p=>p.originals),...anydoc.workspaceOriginals,...elk.originals,...pdf.originals].map(e=>e.reviewPath).sort();
  const base=new URL('docs/third-party-source-licenses/',project);
  const files=(await readdir(base,{recursive:true})).map(p=>p.replaceAll('\\','/')).filter(p=>p.endsWith('.txt')).map(p=>'docs/third-party-source-licenses/'+p).sort();assert.deepEqual(files,expected);assert.equal(files.length,226);
});
