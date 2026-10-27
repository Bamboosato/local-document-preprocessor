import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './distribution-research.mjs';
const records=JSON.parse(await readFile(new URL('../../docs/evidence/json-distribution-source-records.json',import.meta.url),'utf8'));
test('DS-05: reviewed archives and source bytes still match the local fixed dependencies',async()=>{
  assert.equal(records.npm.length,3);assert.equal(records.sources.length,12);
  for(const p of records.npm){
    const base=p.name==='elkjs'?new URL('./',import.meta.url):new URL('../../',import.meta.url);
    const lock=JSON.parse(await readFile(new URL('package-lock.json',base),'utf8'));
    const meta=lock.packages['node_modules/'+p.name];assert.equal(p.version,meta.version);assert.equal(p.integrity,meta.integrity);assert.equal(p.tarball,meta.resolved);assert.equal(p.archiveIntegrity,'verified');
  }
  const files={'elk-bundle':'experiments/json-gates/node_modules/elkjs/lib/elk.bundled.js','pdfium-wasm':'node_modules/@embedpdf/pdfium/dist/pdfium.wasm','pdfium-notice':'node_modules/@embedpdf/pdfium/LICENSE.pdfium'};
  for(const [id,path]of Object.entries(files)){const s=records.sources.find(s=>s.id===id);assert.equal(s.installedMatch,true);assert.equal(s.sha256,sha256(await readFile(new URL('../../'+path,import.meta.url))));}
  for(const s of records.sources)assert.match(s.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
  assert.equal(records.originalReview.khroma.sha256,sha256(await readFile(new URL('./node_modules/khroma/license',import.meta.url))));
  const khroma=JSON.parse(await readFile(new URL('./node_modules/khroma/package.json',import.meta.url),'utf8'));
  assert.equal(records.originalReview.khroma.version,khroma.version);assert.equal(records.originalReview.khroma.declaredLicense,khroma.license??null);
  assert.equal(records.originalReview.khroma.declaredLicense,null);assert.equal(records.originalReview.khroma.observedOriginal,'MIT');
});
test('DS-06: registry candidates remain explicitly separate from a WASM target closure and original notices',()=>{
  assert.equal(records.cargoScope.workspaceLockPackages,192);assert.equal(records.cargoScope.registryCandidates,188);assert.equal(records.crates.length,188);assert.equal(records.cargoScope.wasmTargetClosure,'not-derived');
  assert.equal(new Set(records.crates.map(p=>p.name+'@'+p.version)).size,188);
  for(const p of records.crates){assert.match(p.checksum,/^[a-f0-9]{64}$/);assert.equal(typeof p.declaredLicense,'string');assert.equal(p.licenseOriginals,'not-collected');assert.equal(p.wasmIncluded,'not-determined');}
});
test('DS-07: recorded attestation content agrees with the archive without claiming signature verification',()=>{
  const npm=records.npm.find(p=>p.name==='@firecrawl/anydoc-wasm'),claim=records.attestations.find(p=>p.predicateType==='https://slsa.dev/provenance/v1');
  assert.equal(claim.cryptographicVerification,'not-performed');assert.ok(claim.source.some(s=>s.digest?.gitCommit===npm.gitHead));
  const digest=Buffer.from(npm.integrity.slice(7),'base64').toString('hex');assert.ok(claim.subject.some(s=>s.digest?.sha512===digest));
});
test('DS-08: manual descriptions prepare scenarios without a browser verdict or PWA capability',()=>{
  for(const scenario of ['ready','invalid','display-failure','empty']){
    const r=spawnSync(process.execPath,[fileURLToPath(new URL('./manual-session.mjs',import.meta.url)),'--describe','chrome',scenario],{encoding:'utf8',timeout:10000});
    assert.equal(r.status,0);const d=JSON.parse(r.stdout);assert.match(d.purpose,/NOT_RUN/);assert.equal(d.PWAInstallation,'not-supported-by-current-package');assert.equal(d.nodes,scenario==='empty'?0:200);assert.equal(d.edges,scenario==='empty'?0:199);
  }
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./manual-session.mjs',import.meta.url)),'--describe','chrome','edge'],{encoding:'utf8',timeout:10000});assert.equal(r.status,1);assert.equal(r.stdout.trim(),'manual-session unsupported option');assert.equal(r.stderr,'');
});
