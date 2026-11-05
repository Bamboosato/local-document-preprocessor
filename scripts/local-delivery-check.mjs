import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// The worker contains the public manifest as an extra entry. Check that both
// reference files are from the same build before using either as a baseline.
export function generationBaseline(manifestBytes, workerBytes) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const text = workerBytes.toString('utf8');
  const prefix = 'self.__LDP_BUILD__=';
  const end = text.indexOf(';\n');
  if (!text.startsWith(prefix) || end < 0) throw new Error('Invalid service worker baseline');
  const embedded = JSON.parse(text.slice(prefix.length, end));
  const expectedManifest = { url: '/pwa-manifest.json', sha256: digest(manifestBytes), bytes: manifestBytes.length };
  const manifestEntries = embedded.assets?.filter(item => item.url === expectedManifest.url);
  if (manifest.schema !== 1 || embedded.schema !== 1 || !/^[a-f0-9]{24}$/.test(manifest.id) || !Array.isArray(manifest.assets) || manifest.assets.some(item => item.url === expectedManifest.url || item.url === '/sw.js') || embedded.id !== manifest.id || manifestEntries?.length !== 1 || JSON.stringify(manifestEntries[0]) !== JSON.stringify(expectedManifest) || JSON.stringify(embedded.assets.filter(item => item.url !== expectedManifest.url)) !== JSON.stringify(manifest.assets)) throw new Error('Baseline generation mismatch');
  return { ...manifest, assets: [...manifest.assets, expectedManifest, { url: '/sw.js', sha256: digest(workerBytes), bytes: workerBytes.length }] };
}

// A loopback-only rehearsal. It is deliberately not a production endpoint checker.
export async function verifyDelivery(base, manifest) {
  const origin = new URL(base);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Expected an HTTP 127.0.0.1 origin');
  if (manifest.schema !== 1 || !Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Invalid or empty manifest');
  const seen = new Set();
  for (const asset of manifest.assets) {
    if (typeof asset.url !== 'string' || !/^\/(?!\/)[A-Za-z0-9@._~/-]+$/.test(asset.url) || asset.url.split('/').some(s => s === '.' || s === '..') || seen.has(asset.url) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) throw new Error('Invalid or duplicate manifest entry');
    seen.add(asset.url);
  }
  const failures = [];
  for (const asset of manifest.assets) {
    try {
      const response = await fetch(new URL(asset.url, origin), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (response.status !== 200) { failures.push(`${asset.url}: HTTP ${response.status}`); continue; }
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const expected = asset.url.endsWith('.wasm') ? ['application/wasm'] : asset.url.endsWith('.js') ? ['text/javascript', 'application/javascript'] : asset.url.endsWith('.css') ? ['text/css'] : asset.url.endsWith('.html') ? ['text/html'] : asset.url === '/pwa-manifest.json' ? ['application/json'] : null;
      if (expected && !expected.includes(mime)) failures.push(`${asset.url}: MIME mismatch`);
      // Node fetch decodes transfer content encodings; compare decoded bytes, never Content-Length.
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) failures.push(`${asset.url}: size or SHA-256 mismatch`);
    } catch { failures.push(`${asset.url}: request failed`); }
  }
  return { count: manifest.assets.length, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/local-delivery-check.mjs http://127.0.0.1:PORT/ dist/pwa-manifest.json');
    const manifestBytes = await readFile(process.argv[3]);
    const workerBytes = await readFile(join(dirname(process.argv[3]), 'sw.js'));
    const result = await verifyDelivery(process.argv[2], generationBaseline(manifestBytes, workerBytes));
    console.log(`Checked ${result.count} assets including manifest and worker; ${result.failures.length} failure(s).`);
    for (const failure of result.failures) console.error(failure);
    if (result.failures.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
