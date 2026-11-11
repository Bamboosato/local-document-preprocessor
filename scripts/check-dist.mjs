import {verifyDistributionConditionMaterials} from './distribution-condition-materials.mjs';
import {verifyMmOriginMaterials} from './mm-origin-materials.mjs';
import {verifyWasmDataMaterials} from './wasm-data-materials.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import {verifyTinySnapshot} from './tiny-materials.mjs';
import {verifyTinyRuntime} from './tiny-release.mjs';
import {verifyPakoMaterials} from './pako-materials.mjs';
import {verifyInternalNotices} from './internal-notices.mjs';
import {verifyPdfiumNoticeMaterials} from './pdfium-notice-materials.mjs';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
const licenseDirectory = new URL('../dist/licenses/', import.meta.url);
const distributionRoot = new URL('../dist/', import.meta.url);
const assets = await readdir(assetDirectory);
for(const name of assets.filter(name=>name.endsWith('.js')&&!name.startsWith('mermaid.tiny-'))){
  const code=await readFile(new URL(name,assetDirectory),'utf8');
  assert.ok(code.startsWith('/*! Local Document Preprocessor: generated, bundled and minified application code; not unmodified upstream sources.'),'Generated JS processing notice missing');
}
assert.ok(assets.some(name=>name.startsWith('json.worker-')&&name.endsWith('.js')),'JSON worker asset missing');
const licenses = await readdir(licenseDirectory);
const workerName = assets.find(
  (name) => name.startsWith('converter.worker-') && name.endsWith('.js'),
);
const anydocWasmName = assets.find(
  (name) => name.startsWith('anydoc_wasm_bg-') && name.endsWith('.wasm'),
);
const pdfiumWasmName = assets.find(
  (name) => name.startsWith('pdfium-') && name.endsWith('.wasm'),
);

assert.ok(workerName, 'The production build must contain the converter worker.');
assert.ok(anydocWasmName, 'The production build must contain the anydoc WASM asset.');
assert.ok(pdfiumWasmName, 'The production build must contain the PDFium WASM asset.');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', distributionRoot), 'utf8'));
const serviceWorker = await readFile(new URL('sw.js', distributionRoot), 'utf8');
const pwa=JSON.parse(await readFile(new URL('pwa-manifest.json',distributionRoot),'utf8'));
const inventory=JSON.parse(await readFile(new URL('licenses/inventory.json',distributionRoot),'utf8'));
const pdfiumMaterials=await verifyPdfiumNoticeMaterials();
assert.equal(inventory.pdfiumNoticeCandidates.groups.length,6);
assert.equal(inventory.pdfiumNoticeCandidates.sourceCommit,pdfiumMaterials.record.pdfiumSourceCommit);
for(const file of pdfiumMaterials.files){
  assert.deepEqual(await readFile(new URL(file.outputPath,licenseDirectory)),file.bytes,'PDFium candidate bytes changed');
  assert.ok(pwa.assets.some(item=>item.url==='/licenses/'+file.outputPath&&item.sha256===file.sha256),'PDFium candidate PWA mismatch');
}
const internal=await verifyInternalNotices();
const pdfLib=inventory.packages.find(item=>item.name==='pdf-lib');
for(const file of internal.files){
  assert.ok(pdfLib.originals.some(item=>item.path===file.outputPath&&item.sha256===file.sha256),'Internal rights original missing');
  assert.deepEqual(await readFile(new URL(file.outputPath,licenseDirectory)),file.bytes,'Internal rights original changed');
  assert.ok(pwa.assets.some(item=>item.url==='/licenses/'+file.outputPath&&item.sha256===file.sha256),'Internal notice PWA mismatch');
}
const pakoMaterial=await verifyPakoMaterials();
const pakoPackage=inventory.packages.find(item=>item.name==='pako');
assert.equal(pakoPackage?.version,pakoMaterial.record.version);
assert.equal(pakoPackage?.license,'(MIT AND Zlib)');
assert.equal(pakoPackage.originals.length,2,'pako must retain MIT and Zlib originals');
assert.ok(pakoPackage.originals.some(item=>item.path===pakoMaterial.path&&item.sha256===pakoMaterial.sha256),'pako Zlib notice missing');
assert.deepEqual(await readFile(new URL(pakoMaterial.path,licenseDirectory)),pakoMaterial.bytes,'pako Zlib notice changed');
assert.ok(pwa.assets.some(item=>item.url==='/licenses/'+pakoMaterial.path&&item.sha256===pakoMaterial.sha256),'pako notice must share the PWA generation');
const dompurify=inventory.packages.find(item=>item.name==='dompurify');
if(dompurify)assert.ok(dompurify.originals.some(item=>item.path.endsWith('/LICENSE-MPL')),'DOMPurify MPL original is missing');
assert.match(pwa.id,/^[a-f0-9]{24}$/);
assert.ok(serviceWorker.startsWith('self.__LDP_BUILD__='));
const embedded=JSON.parse(serviceWorker.slice('self.__LDP_BUILD__='.length,serviceWorker.indexOf(';\n')));
assert.equal(embedded.id,pwa.id,'PWA worker/page generation mismatch');
assert.ok((await readFile(new URL('index.html',distributionRoot),'utf8')).includes(`<meta name="ldp-generation" content="${pwa.id}">`),'PWA HTML generation missing');
assert.deepEqual(embedded.assets.filter(asset=>asset.url!=='/pwa-manifest.json'),pwa.assets,'PWA embedded manifest mismatch');
const manifestBytes=await readFile(new URL('pwa-manifest.json',distributionRoot));
assert.equal(embedded.assets.find(asset=>asset.url==='/pwa-manifest.json')?.sha256,createHash('sha256').update(manifestBytes).digest('hex'));
assert.ok(!/\.(skipWaiting|claim)\(/.test(serviceWorker),'PWA update must not force takeover');
for(const entry of pwa.assets){
  const bytes=await readFile(new URL(entry.url.slice(1),distributionRoot));
  assert.equal(bytes.length,entry.bytes,'PWA size mismatch');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'PWA digest mismatch');
}
assert.ok(pwa.assets.some(entry=>entry.url.includes('json.worker-'))&&pwa.assets.some(entry=>entry.url.endsWith('.wasm'))&&pwa.assets.some(entry=>entry.url==='/licenses/inventory.json'));
await Promise.all(
  ['ldp_icon-192.png', 'ldp_icon-512.png'].map((name) => readFile(new URL(name, distributionRoot))),
);
assert.equal(manifest.display, 'standalone', 'The PWA manifest must use standalone display mode.');
assert.equal(manifest.start_url, '/', 'The PWA manifest must start at the app root.');
assert.deepEqual(
  manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
  [
    { src: '/ldp_icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/ldp_icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  'The PWA manifest must expose the required icon sizes.',
);
assert.ok(
  serviceWorker.includes("url.search === ''") && serviceWorker.includes('function isStaticAsset'),
  'The Service Worker must restrict caching to static asset URLs without query data.',
);
assert.ok(
  !serviceWorker.includes('localStorage') && !serviceWorker.includes('indexedDB'),
  'The Service Worker must not use browser data stores.',
);
assert.deepEqual(
  licenses.sort(),
  [
    'PDFium-LICENSE.txt',
    'anydoc-MIT.txt',
    'embedpdf-pdfium-MIT.txt',
    'fflate-MIT.txt',
    'pdf-lib-MIT.txt',
    'dependencies',
    'wasm-candidates',
    'index.html',
    'inventory.json',
    'mermaid-tiny',
    'pdfium-candidates',
    'wasm-data',
    'mm-font-origin',
    'wasm-conditions',
  ].sort(),
  'The production build must retain all third-party license files.',
);

const worker = await readFile(new URL(workerName, assetDirectory), 'utf8');
const licensePage=await readFile(new URL('index.html',licenseDirectory),'utf8');
assert.ok(licensePage.includes('mermaid-tiny/index.html'),'Tiny originals must be reachable from the root license page');
const tiny=await verifyTinySnapshot();
await verifyTinyRuntime(tiny.release);
const tinyAssets=assets.filter(name=>/^mermaid\.tiny-.*\.js$/.test(name));
assert.equal(tinyAssets.length,1,'Exactly one fixed Tiny asset is required');
assert.equal(createHash('sha256').update(await readFile(new URL(tinyAssets[0],assetDirectory))).digest('hex'),tiny.record.bundleSha256,'Tiny public bytes must remain unchanged');
for(const file of tiny.files){
  const url='/licenses/mermaid-tiny/'+file.name;
  assert.equal(createHash('sha256').update(await readFile(new URL(url.slice(1),distributionRoot))).digest('hex'),file.sha256,'Tiny license bytes mismatch');
  assert.ok(pwa.assets.some(asset=>asset.url===url&&asset.sha256===file.sha256),'Tiny original must be in the same PWA generation');
}
assert.ok(tiny.files.find(file=>file.name==='index.html').bytes.toString().includes('DOMPurifyはApache-2.0を選択'),'Tiny DOMPurify selection missing');
assert.equal(inventory.embeddedTiny.bundleSha256,tiny.record.bundleSha256);
assert.equal(inventory.embeddedTiny.version,tiny.release.version);
assert.ok(licensePage.includes(`Tiny ${tiny.release.version} 内包物のライセンス・由来・変更`),'Tiny visible version mismatch');
const helper=tiny.manifest.items.find(item=>item.name==='@babel/helpers'&&item.version==='7.29.10');
assert.ok(helper&&!helper.referenceOnly,'Embedded generated helper original missing');
const helperText=tiny.files.find(file=>'/licenses/mermaid-tiny/'+file.name===helper.path)?.bytes.toString();
assert.ok(helperText?.includes('Sebastian McKenzie')&&helperText.includes('Facebook')&&helperText.includes('Permission is hereby granted'),'Helper MIT original incomplete');
assert.ok(!assets.some(name=>/mermaid\.core|^elk[-.]|flowDiagram-/.test(name)),'Old Mermaid chunks remain');
for(const name of assets.filter(name=>name.endsWith('.js')))assert.ok(!/elkjs|org\.eclipse\.elk/.test(await readFile(new URL(name,assetDirectory),'utf8')),'ELK implementation marker in a distributed script');
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
const candidateEvidence=JSON.parse(await readFile(new URL('../docs/evidence/json-anydoc-target-licenses.json',import.meta.url),'utf8'));
assert.deepEqual(inventory.wasmCandidates.map(({name,version})=>`${name}@${version}`),['encoding_rs@0.8.35','unicode-ident@1.0.24','zlib-rs@0.6.6']);
assert.ok(licensePage.includes('WASM 依存候補の原文')&&licensePage.includes('WASM に含まれることや依存一覧の網羅性を示すものではありません'));
for(const candidate of inventory.wasmCandidates){
  const source=candidateEvidence.packages.find(pkg=>pkg.name===candidate.name&&pkg.version===candidate.version);
  assert.ok(source);
  assert.equal(candidate.declaredLicense,source.declaredLicense);
  assert.equal(candidate.originals.length,source.originals.length);
  for(const original of source.originals){
    const name=original.path.split('/').at(-1);
    const relative=`wasm-candidates/anydoc/${candidate.name}@${candidate.version}/${name}`;
    const matches=candidate.originals.filter(item=>item.path===relative);
    assert.equal(matches.length,1,'Candidate original missing or duplicated');
    const bytes=await readFile(new URL(relative,licenseDirectory));
    assert.equal(bytes.length,original.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),original.sha256);
    assert.equal(matches[0].sha256,original.sha256);
    assert.equal(matches[0].bytes,original.bytes);
    assert.ok(licensePage.includes(relative.split('/').map(segment=>encodeURIComponent(segment).replace(/%40/gi,'@')).join('/')),'Candidate original must be linked');
    assert.ok(pwa.assets.some(asset=>asset.url==='/licenses/'+relative&&asset.sha256===original.sha256),'Candidate original must be in PWA manifest');
  }
}
assert.ok(inventory.scope.includes('not linked WASM SBOM'));
for(const name of ['@mermaid-js/tiny','jsonc-parser'])assert.ok(inventory.packages.some(pkg=>pkg.name===name));
assert.ok(!Object.keys(lock.packages).some(name=>/(?:^|\/)node_modules\/(?:mermaid|elkjs)$/.test(name)),'Old root Mermaid/ELK dependency remains');
for(const pkg of inventory.packages){
  assert.equal(pkg.version,lock.packages[pkg.lockPath]?.version);assert.equal(pkg.integrity,lock.packages[pkg.lockPath]?.integrity);
  for(const original of pkg.originals){
  assert.ok(original.path.startsWith('dependencies/')&&!original.path.includes('..'));
  assert.ok(licensePage.includes(original.path.split('/').map(segment=>encodeURIComponent(segment).replace(/%40/gi,'@')).join('/')),'License page must link to every collected original');
  assert.equal(createHash('sha256').update(await readFile(new URL(original.path,licenseDirectory))).digest('hex'),original.sha256);
}
}
const originalHashes=new Set(inventory.packages.flatMap(pkg=>pkg.originals.map(original=>original.sha256)));
assert.ok(!licenses.includes('PDFium-Apache-2.0.txt'),'Legacy partial-license alias must not be emitted');
const pdfiumLicense=await readFile(new URL('PDFium-LICENSE.txt',licenseDirectory),'utf8');
assert.ok(pdfiumLicense.includes('Redistribution and use in source and binary forms')&&pdfiumLicense.includes('Apache License'),'PDFium combined original must retain both sections');
for(const name of ['PDFium-LICENSE.txt','anydoc-MIT.txt','embedpdf-pdfium-MIT.txt','fflate-MIT.txt','pdf-lib-MIT.txt']){
  assert.ok(originalHashes.has(createHash('sha256').update(await readFile(new URL(name,licenseDirectory))).digest('hex')),'Top-level license must be reachable from the index');
}
assert.ok(
  !worker.includes('document.createElement'),
  'The converter worker must not bundle DOM-only dependencies.',
);
assert.ok(
  !worker.includes('localStorage') && !worker.includes('indexedDB'),
  'The converter worker must not use persistent browser storage.',
);



const confirmedData=await verifyWasmDataMaterials();
assert.equal(inventory.confirmedWasmData.originals.length,3);
for(const f of confirmedData.files){
 assert.deepEqual(await readFile(new URL(f.outputPath,licenseDirectory)),f.bytes);
 assert.ok(inventory.confirmedWasmData.originals.some(i=>i.path===f.outputPath&&i.sha256===f.sha256));
 assert.ok(licensePage.includes(f.outputPath));
 assert.ok(pwa.assets.some(a=>a.url==='/licenses/'+f.outputPath&&a.sha256===f.sha256));
}

const mmOrigins=await verifyMmOriginMaterials();
assert.equal(inventory.mmFontOrigin.originals.length,2);
for(const f of mmOrigins.files){
 assert.deepEqual(await readFile(new URL(f.outputPath,licenseDirectory)),f.bytes);
 assert.ok(inventory.mmFontOrigin.originals.some(i=>i.path===f.outputPath&&i.sha256===f.sha256));
 assert.ok(licensePage.includes(f.outputPath));
 assert.ok(pwa.assets.some(a=>a.url==='/licenses/'+f.outputPath&&a.sha256===f.sha256));
}
const conditionMaterials=await verifyDistributionConditionMaterials();
assert.equal(inventory.conditionPreparation.units.length,119);
assert.equal(inventory.conditionPreparation.releaseApproval,false);
for(const f of conditionMaterials.files){
 assert.deepEqual(await readFile(new URL(f.outputPath,licenseDirectory)),f.content);
 assert.ok(pwa.assets.some(a=>a.url==='/licenses/'+f.outputPath&&a.sha256===f.sha256));
 assert.ok(licensePage.includes(f.outputPath.split('/').map(encodeURIComponent).join('/'))||f.outputPath===inventory.conditionPreparation.credits.path);
}
console.log(`dist check passed: ${workerName}, ${anydocWasmName}, ${pdfiumWasmName}`);
