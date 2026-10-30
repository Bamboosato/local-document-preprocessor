import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
const licenseDirectory = new URL('../dist/licenses/', import.meta.url);
const distributionRoot = new URL('../dist/', import.meta.url);
const assets = await readdir(assetDirectory);
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
    'PDFium-Apache-2.0.txt',
    'anydoc-MIT.txt',
    'embedpdf-pdfium-MIT.txt',
    'fflate-MIT.txt',
    'pdf-lib-MIT.txt',
    'dependencies',
    'inventory.json',
  ].sort(),
  'The production build must retain all third-party license files.',
);

const worker = await readFile(new URL(workerName, assetDirectory), 'utf8');
const inventory=JSON.parse(await readFile(new URL('inventory.json',licenseDirectory),'utf8'));
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
assert.ok(inventory.scope.includes('not linked WASM SBOM'));
for(const name of ['mermaid','jsonc-parser'])assert.ok(inventory.packages.some(pkg=>pkg.name===name));
for(const pkg of inventory.packages){
  assert.equal(pkg.version,lock.packages[pkg.lockPath]?.version);assert.equal(pkg.integrity,lock.packages[pkg.lockPath]?.integrity);
  for(const original of pkg.originals){
  assert.ok(original.path.startsWith('dependencies/')&&!original.path.includes('..'));
  assert.equal(createHash('sha256').update(await readFile(new URL(original.path,licenseDirectory))).digest('hex'),original.sha256);
}
}
assert.ok(
  !worker.includes('document.createElement'),
  'The converter worker must not bundle DOM-only dependencies.',
);
assert.ok(
  !worker.includes('localStorage') && !worker.includes('indexedDB'),
  'The converter worker must not use persistent browser storage.',
);

console.log(`dist check passed: ${workerName}, ${anydocWasmName}, ${pdfiumWasmName}`);
