import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const root=new URL('./dist-readiness/',import.meta.url);
test('PR-B01: manifest includes HTML and every runtime asset, without iframe/PDF comparison assets',async()=>{
  const manifest=JSON.parse(await readFile(new URL('readiness-assets.json',root),'utf8'));
  const files=(await readdir(root,{recursive:true})).map(p=>p.replaceAll('\\','/'));
  const expected=files.filter(p=>p==='readiness.html'||p.startsWith('assets/')&&/\.(js|svg)$/.test(p)).map(p=>'/'+p).sort();
  assert.deepEqual(manifest.assets.toSorted(),expected);
  assert.ok(manifest.assets.includes('/readiness.html'));
  assert.equal(manifest.assets.filter(p=>/validation-worker-/.test(p)).length,1);
  assert.equal(manifest.assets.filter(p=>/layout-worker-/.test(p)).length,1);
  assert.equal(manifest.assets.filter(p=>/readiness-icon-.*\.svg$/.test(p)).length,1);
  assert.equal(manifest.assets.length,5);
  assert.equal(files.some(p=>/frame\.html|\.wasm$/.test(p)),false);
  const sw=await readFile(new URL('readiness-sw.js',root),'utf8');
  assert.ok(sw.includes('json-readiness-'+manifest.generation));
  assert.ok(!sw.includes('__GENERATION__')&&!sw.includes('__ASSETS__'));
});
