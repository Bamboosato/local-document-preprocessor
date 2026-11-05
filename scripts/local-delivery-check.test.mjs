import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { generationBaseline, verifyDelivery } from './local-delivery-check.mjs';

const body = Buffer.from('expected');
const entry = { url: '/asset.js', bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
const manifest = { schema: 1, assets: [entry] };

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}/`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('decoded gzip body and accepted JavaScript MIME pass', async () => {
  await withServer((_, res) => { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'content-encoding': 'gzip' }); res.end(gzipSync(body)); }, async base => {
    assert.deepEqual(await verifyDelivery(base, manifest), { count: 1, failures: [] });
  });
});

test('wrong body, MIME, missing asset and redirects fail without following', async () => {
  for (const [status, mime, data, expected] of [[200, 'text/html', 'expected', 'MIME'], [200, 'text/javascript', 'different', 'SHA-256'], [404, 'text/plain', '', 'HTTP 404'], [302, 'text/plain', '', 'HTTP 302']]) {
    await withServer((_, res) => { res.writeHead(status, { 'content-type': mime, location: '/elsewhere' }); res.end(data); }, async base => {
      const result = await verifyDelivery(base, manifest);
      assert.ok(result.failures.some(failure => failure.includes(expected)), expected);
    });
  }
});

test('invalid manifest and non-loopback destinations fail before requesting', async () => {
  await assert.rejects(verifyDelivery('https://example.com/', manifest));
  for (const assets of [[], [entry, entry], [{...entry, url: '/../other'}], [{...entry, sha256: 'bad'}]]) {
    await assert.rejects(verifyDelivery('http://127.0.0.1:1/', {schema: 1, assets}));
  }
});

test('network failure fails closed', async () => {
  await withServer((req, res) => res.destroy(), async base => {
    const result = await verifyDelivery(base, manifest);
    assert.match(result.failures[0], /request failed/);
  });
});

test('generation baseline rejects mixed, malformed and duplicate references', () => {
  const original = { schema: 1, id: 'a'.repeat(24), assets: [entry] };
  const bytes = Buffer.from(JSON.stringify(original));
  const marker = {url: '/pwa-manifest.json', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length};
  const worker = data => Buffer.from(`self.__LDP_BUILD__=${JSON.stringify(data)};\nworker`);
  const embedded = {...original, assets: [entry, marker]};
  const baseline = generationBaseline(bytes, worker(embedded));
  assert.deepEqual(baseline.assets.map(item => item.url), ['/asset.js', '/pwa-manifest.json', '/sw.js']);
  assert.throws(() => generationBaseline(bytes, worker({...embedded, id: 'b'.repeat(24)})), /mismatch/);
  assert.throws(() => generationBaseline(bytes, worker({...embedded, assets: [entry, marker, marker]})), /mismatch/);
  assert.throws(() => generationBaseline(bytes, worker({...embedded, assets: [{...entry, bytes: 1}, marker]})), /mismatch/);
  assert.throws(() => generationBaseline(Buffer.from('{}'), worker(embedded)), /mismatch/);
  assert.throws(() => generationBaseline(bytes, Buffer.from('not a worker')), /Invalid/);
});

test('manifest and worker delivery mismatches are detected independently', async () => {
  const original = { schema: 1, id: 'a'.repeat(24), assets: [entry] };
  const bytes = Buffer.from(JSON.stringify(original));
  const marker = {url: '/pwa-manifest.json', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length};
  const worker = Buffer.from(`self.__LDP_BUILD__=${JSON.stringify({...original, assets: [entry, marker]})};\nworker`);
  const baseline = generationBaseline(bytes, worker);
  await withServer((req, res) => {
    res.writeHead(200, {'content-type': req.url === '/pwa-manifest.json' ? 'application/json' : 'application/javascript'});
    res.end(req.url === '/asset.js' ? body : req.url === '/pwa-manifest.json' ? bytes : worker);
  }, async base => assert.deepEqual(await verifyDelivery(base, baseline), {count: 3, failures: []}));
  await withServer((req, res) => {
    const mime = req.url === '/pwa-manifest.json' ? 'application/json' : 'application/javascript';
    res.writeHead(200, {'content-type': mime});
    res.end(req.url === '/asset.js' ? body : 'wrong version');
  }, async base => {
    const result = await verifyDelivery(base, baseline);
    assert.equal(result.count, 3);
    assert.ok(result.failures.some(failure => failure.startsWith('/pwa-manifest.json:')));
    assert.ok(result.failures.some(failure => failure.startsWith('/sw.js:')));
  });
});
