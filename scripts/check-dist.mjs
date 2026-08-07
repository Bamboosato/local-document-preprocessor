import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
const licenseDirectory = new URL('../dist/licenses/', import.meta.url);
const distributionRoot = new URL('../dist/', import.meta.url);
const assets = await readdir(assetDirectory);
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
  ],
  'The production build must retain all third-party license files.',
);

const worker = await readFile(new URL(workerName, assetDirectory), 'utf8');
assert.ok(
  !worker.includes('document.createElement'),
  'The converter worker must not bundle DOM-only dependencies.',
);
assert.ok(
  !worker.includes('localStorage') && !worker.includes('indexedDB'),
  'The converter worker must not use persistent browser storage.',
);

console.log(`dist check passed: ${workerName}, ${anydocWasmName}, ${pdfiumWasmName}`);
