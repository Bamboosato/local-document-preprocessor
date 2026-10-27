import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./dist-integration/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('IC-B01: emitted HTML, static Workers and both WASM assets share a complete hashed generation',async()=>{
  const manifest=JSON.parse(await readFile(new URL('integration-assets.json',root),'utf8'));
  const files=(await readdir(root,{recursive:true})).map(p=>p.replaceAll('\\','/')).filter(p=>p==='readiness.html'||p.startsWith('assets/')&&/\.(js|css|svg|wasm)$/.test(p)).sort();
  assert.deepEqual(manifest.runtime.map(x=>x.url),files.map(x=>'/'+x));
  assert.equal(files.filter(x=>x.endsWith('.wasm')).length,2);
  assert.equal(files.filter(x=>/worker-.*\.js$/.test(x)).length,3);
  for(const item of manifest.runtime)assert.equal(hash(await readFile(new URL('.'+item.url,root))),item.sha256);
  const template=(await readFile(new URL('./readiness-sw-template.js',import.meta.url),'utf8')).replaceAll('json-readiness-','json-integration-');
  assert.equal(hash(manifest.csp+template+JSON.stringify(manifest.runtime)).slice(0,16),manifest.generation);
  const sw=await readFile(new URL('integration-sw.js',root),'utf8');assert.ok(sw.includes('json-integration-'+manifest.generation));
  for(const item of manifest.runtime)assert.ok(sw.includes(JSON.stringify(item.url)));
});
test('IC-L01: actual chunk modules map to fixed lock packages and original notices without local paths',async()=>{
  const inventory=JSON.parse(await readFile(new URL('licenses/bundled.json',root),'utf8'));
  for(const [origin,name] of [['root','@firecrawl/anydoc-wasm'],['root','@embedpdf/pdfium'],['prototype','mermaid']])assert.ok(inventory.packages.some(p=>p.origin===origin&&p.name===name));
  for(const p of inventory.packages){
    const base=p.origin==='root'?new URL('../../',import.meta.url):new URL('./',import.meta.url);
    const lock=JSON.parse(await readFile(new URL('package-lock.json',base),'utf8'));
    assert.equal(lock.packages[p.lockPath].version,p.version);assert.equal(lock.packages[p.lockPath].integrity,p.integrity);
    assert.equal(lock.packages[p.lockPath].resolved,p.sourcePackage);
    assert.ok(p.modules.length&&p.notices.length);
    for(const module of p.modules){assert.ok(!/^[A-Za-z]:|^\/|\.\./.test(module.file));assert.equal(hash(await readFile(new URL(p.lockPath+'/'+module.file,base))),module.sha256);}
    for(const notice of p.notices)assert.ok((await readFile(new URL(notice,root))).length);
  }
  const manifest=JSON.parse(await readFile(new URL('integration-assets.json',root),'utf8'));
  for(const wasm of manifest.runtime.filter(p=>p.url.endsWith('.wasm')))assert.ok(inventory.packages.some(p=>p.modules.some(m=>m.file.endsWith('.wasm')&&m.sha256===wasm.sha256)));
});
