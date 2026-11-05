import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
      const expected = asset.url.endsWith('.wasm') ? ['application/wasm'] : asset.url.endsWith('.js') ? ['text/javascript', 'application/javascript'] : asset.url.endsWith('.css') ? ['text/css'] : asset.url.endsWith('.html') ? ['text/html'] : null;
      if (expected && !expected.includes(mime)) failures.push(`${asset.url}: MIME mismatch`);
      // Node fetch decodes transfer content encodings; compare decoded bytes, never Content-Length.
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) failures.push(`${asset.url}: size or SHA-256 mismatch`);
    } catch { failures.push(`${asset.url}: request failed`); }
  }
  return { count: manifest.assets.length, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/local-delivery-check.mjs http://127.0.0.1:PORT/ dist/pwa-manifest.json');
    const manifest = JSON.parse(await readFile(process.argv[3], 'utf8'));
    const result = await verifyDelivery(process.argv[2], manifest);
    console.log(`Checked ${result.count} manifest assets; ${result.failures.length} failure(s).`);
    for (const failure of result.failures) console.error(failure);
    if (result.failures.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
