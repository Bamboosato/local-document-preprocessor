import {test,expect} from '@playwright/test';
import {cp,mkdtemp,mkdir,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {buildPwaManifest} from '../../scripts/build-pwa-manifest.mjs';

let temporary,server,base,current='A',blocked='',blockedHits=0,legacy=false,builds={};
const root=process.cwd();
test.beforeAll(async()=>{
  test.setTimeout(120000);
  temporary=await mkdtemp(join(tmpdir(),'ldp-pwa-browser-'));
  for(const version of ['A','B']){
    const project=join(temporary,version);await mkdir(project);
    for(const file of ['src','public','index.html','package.json'])await cp(resolve(root,file),join(project,file),{recursive:true});
    await symlink(resolve(root,'node_modules'),join(project,'node_modules'),process.platform==='win32'?'junction':'dir');
    const app=join(project,'src/App.tsx');await writeFile(app,(await readFile(app,'utf8')).replaceAll('Local Document Preprocessor',`PWA fixture ${version}`));
    const worker=join(project,'src/json/json.worker.ts');await writeFile(worker,(await readFile(worker,'utf8'))+`\n(self as unknown as {fixture:string}).fixture=${JSON.stringify(version)};\n`);
    execFileSync(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build',project,'--config',resolve(root,'vite.config.ts')],{cwd:root,stdio:'pipe',windowsHide:true});
    const dist=join(project,'dist');await cp(resolve(root,'dist/licenses'),join(dist,'licenses'),{recursive:true});
    builds[version]={dist,manifest:await buildPwaManifest(dist)};
  }
  server=createServer(async(request,response)=>{
    try{
      const path=decodeURIComponent(new URL(request.url,'http://fixture').pathname);
      if(legacy&&current==='A'&&path==='/sw.js'){
        // Migration fixture reproduces v1's network-first HTML, static cache,
        // skipWaiting/claim and absence of the new status protocol.
        response.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
        response.end(`const C='ldp-static-v1';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search)return;e.respondWith((async()=>{const c=await caches.open(C);if(u.pathname==='/'){try{const r=await fetch(e.request);await c.put(e.request,r.clone());return r;}catch{return c.match(e.request);}}return await c.match(e.request)||fetch(e.request);})());});`);return;
      }
      if(blocked&&current==='B'&&path===blocked){blockedHits++;response.writeHead(503);response.end('fixture missing');return;}
      const directory=builds[current].dist,file=resolve(directory,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(directory+sep)){response.writeHead(404);response.end();return;}
      const bytes=await readFile(file),mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(file)]??'text/plain';
      response.writeHead(200,{'content-type':mime,'cache-control':'no-store'});response.end(bytes);
    }catch{response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(temporary){if(!resolve(temporary).startsWith(resolve(tmpdir())+sep)||!temporary.includes('ldp-pwa-browser-'))throw Error('unsafe-cleanup');await rm(temporary,{recursive:true,force:true});}
});
test.beforeEach(()=>{current='A';blocked='';blockedHits=0;legacy=false;});
async function controlled(page){
  await page.goto(base);await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),{timeout:30000}).toBe(true);
  await page.reload();await expect(page.getByText('この世代のオフライン資産は準備済みです。',{exact:true})).toBeVisible({timeout:30000});
}
const json=(name,text)=>({name,mimeType:'application/json',buffer:Buffer.from(text)});
async function convert(page,name,value,style='items'){
  await page.locator('input[type=file]').setInputFiles(json(name,JSON.stringify({value})));
  if(style==='mermaid')await page.getByRole('radio',{name:'Mermaid構造図',exact:true}).check();
  await page.getByRole('button',{name:'この設定に決定',exact:true}).click();await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(page.locator('.result-card')).toContainText(value);
}
test('PG-01 actual A/B builds wait for every old tab; old lazy worker and offline B conversion remain generation-correct',async({browser})=>{
  test.setTimeout(60000); // Two installs plus first-use offline JSON/SVG/PDF/CSV.
  const context=await browser.newContext(),a=await context.newPage();
  try{
    await controlled(a);await expect(a.getByRole('heading',{name:'PWA fixture A',exact:true})).toBeVisible();await convert(a,'A.json','PRESERVED_A');
    const second=await context.newPage();await second.goto(base);current='B';
    await a.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await expect(a.getByText(/更新の準備ができました/)).toBeVisible({timeout:30000});await expect(a.locator('.result-card')).toContainText('PRESERVED_A');
    await expect(second.getByRole('heading',{name:'PWA fixture A',exact:true})).toBeVisible();
    await context.setOffline(true);await convert(second,'late-A.json','OLD_LAZY_WORKER_A');await context.setOffline(false);
    await a.close();await expect(second.getByRole('heading',{name:'PWA fixture A',exact:true})).toBeVisible();
    let next;for(const worker of context.serviceWorkers())if(await worker.evaluate(()=>self.__LDP_BUILD__?.id)===builds.B.manifest.id)next=worker;
    expect(next).toBeDefined();
    // Do not open a new A client while waiting for B to finish activation.
    await second.close();await expect.poll(()=>next.evaluate(()=>!self.registration.waiting&&self.registration.active?.state==='activated'),{timeout:30000}).toBe(true);
    const b=await context.newPage();await b.goto(base);await expect(b.getByRole('heading',{name:'PWA fixture B',exact:true})).toBeVisible();
    const caches=await b.evaluate(()=>window.caches.keys());expect(caches).toEqual(['ldp-static-'+builds.B.manifest.id]);
    await context.setOffline(true);await b.reload();await convert(b,'B.json','OFFLINE_B','mermaid');await expect(b.locator('.json-svg svg')).toBeVisible();
    await b.locator('input[type=file]').setInputFiles([{name:'offline.pdf',mimeType:'application/pdf',buffer:await readFile(resolve(root,'tests/fixtures/pdf/normal-machine-readable.pdf'))},{name:'offline.csv',mimeType:'text/csv',buffer:Buffer.from('name,value\nOFFLINE_CSV,2\n')}]);
    await expect(b.getByText('構造確認中',{exact:true})).toHaveCount(0);await b.getByRole('button',{name:'2 ファイルを変換',exact:true}).click();await expect(b.locator('.result-card')).toHaveCount(2);await expect(b.locator('.result-card').filter({has:b.getByRole('heading',{name:'offline.csv',exact:true})})).toContainText('OFFLINE_CSV');
    for(const card of await b.locator('.result-card').all())await expect(card.getByRole('button',{name:'Markdown をダウンロード',exact:true})).toBeEnabled();
  }finally{await context.close();}
});
test('PG-02 failed B install preserves A and explicit update retry can prepare B',async({browser})=>{
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await controlled(page);await convert(page,'safe.json','KEPT_ON_FAILURE');expect(await page.evaluate(()=>caches.keys())).toEqual(['ldp-static-'+builds.A.manifest.id]);current='B';blocked=new URL(builds.B.manifest.assets.find(asset=>asset.url.includes('json.worker-')).url,base).pathname;
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await expect(page.getByRole('button',{name:'オフライン資産を再取得',exact:true})).toBeVisible({timeout:30000});await expect(page.locator('.result-card')).toContainText('KEPT_ON_FAILURE');
    await expect.poll(()=>blockedHits).toBeGreaterThan(0);
    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting;});
    const state=await page.evaluate(async({a,b})=>{
      const names=await caches.keys(),old=await(await caches.open('ldp-static-'+a)).match('/__ldp_static_ready__');
      const candidate=names.includes('ldp-static-'+b)?await(await caches.open('ldp-static-'+b)).match('/__ldp_static_ready__'):undefined;
      const active=await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('active status timeout')),5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};navigator.serviceWorker.controller.postMessage({type:'LDP_STATUS'},[channel.port2]);});
      return {oldReady:old?await old.text():null,candidateReady:candidate?await candidate.text():null,active};
    },{a:builds.A.manifest.id,b:builds.B.manifest.id});
    expect(state.oldReady).toBe(builds.A.manifest.id);expect(state.candidateReady).toBeNull();expect(state.active.generation).toBe(builds.A.manifest.id);expect(state.active.complete).toBe(true);
    blocked='';await page.getByRole('button',{name:'オフライン資産を再取得',exact:true}).click();await expect(page.getByText(/更新の準備ができました/)).toBeVisible({timeout:30000});
    await expect(page.locator('.result-card')).toContainText('KEPT_ON_FAILURE');
  }finally{await context.close();}
});
test('PG-03 evicted lazy JSON worker fails offline without false output; online asset repair recovers',async({browser})=>{
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await controlled(page);const asset=builds.A.manifest.assets.find(asset=>asset.url.includes('json.worker-')).url;
    await page.evaluate(async({name,asset})=>{await(await caches.open(name)).delete(asset);},{name:'ldp-static-'+builds.A.manifest.id,asset});
    await context.setOffline(true);await page.locator('input[type=file]').setInputFiles(json('missing.json','{"value":"RECOVERED"}'));
    await expect(page.getByText(/オフライン資産の一部を利用できません/)).toBeVisible();await expect(page.locator('.result-card')).toHaveCount(0);
    await context.setOffline(false);await page.getByRole('button',{name:'オフライン資産を再取得',exact:true}).click();await expect(page.getByText('この世代のオフライン資産は準備済みです。',{exact:true})).toBeVisible({timeout:30000});
    await convert(page,'retry.json','RECOVERED');
  }finally{await context.close();}
});
test('PG-04 legacy v1 controlling new HTML cannot enable conversion; closing all clients finishes migration',async({browser})=>{
  test.setTimeout(60000);legacy=true;const context=await browser.newContext(),old=await context.newPage();
  try{
    await old.goto(base);await old.waitForFunction(()=>!!navigator.serviceWorker.controller);current='B';await old.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await expect.poll(()=>old.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),{timeout:30000}).toBe(true);
    const mixed=await context.newPage();await mixed.goto(base);await expect(mixed.getByRole('heading',{name:'PWA fixture B',exact:true})).toBeVisible();
    await mixed.locator('input[type=file]').setInputFiles(json('guard.json','{"value":"NO_MIXED_SUCCESS"}'));await mixed.getByRole('button',{name:'この設定に決定',exact:true}).click();
    await expect(mixed.getByRole('button',{name:'1 ファイルを変換',exact:true})).toBeDisabled();await expect(mixed.getByText(/更新の準備ができました/)).toBeVisible();await expect(mixed.locator('.result-card')).toHaveCount(0);
    let next;for(const worker of context.serviceWorkers())if(await worker.evaluate(()=>self.__LDP_BUILD__?.id)===builds.B.manifest.id)next=worker;expect(next).toBeDefined();
    await old.close();await mixed.close();await expect.poll(()=>next.evaluate(()=>!self.registration.waiting&&self.registration.active?.state==='activated'),{timeout:30000}).toBe(true);
    const page=await context.newPage();await page.goto(base);await convert(page,'migrated.json','MIGRATION_COMPLETE');expect(await page.evaluate(()=>caches.keys())).toEqual(['ldp-static-'+builds.B.manifest.id]);
  }finally{await context.close();}
});
test('PG-05 lost HTML can prepare the next build from the recovery page without discarding another tab',async({browser})=>{
  test.setTimeout(60000);const context=await browser.newContext(),old=await context.newPage();
  try{
    await controlled(old);await convert(old,'kept.json','RECOVERY_PRESERVES_OTHER_TAB');current='B';blocked=new URL(builds.B.manifest.assets.find(asset=>asset.url.includes('json.worker-')).url,base).pathname;
    await old.evaluate(async name=>{await(await caches.open(name)).delete('/index.html');},'ldp-static-'+builds.A.manifest.id);
    const recovery=await context.newPage();const response=await recovery.goto(base);expect(response.status()).toBe(503);await expect(recovery.getByRole('heading',{name:'オフライン資産を利用できません',exact:true})).toBeVisible();
    await recovery.getByRole('button',{name:'更新を確認',exact:true}).click();await expect(recovery.getByText(/更新を準備できませんでした/)).toBeVisible({timeout:30000});await expect(recovery.getByRole('button',{name:'更新を確認',exact:true})).toBeEnabled();
    blocked='';await recovery.getByRole('button',{name:'更新を確認',exact:true}).click();await expect(recovery.getByText(/更新の準備ができました/)).toBeVisible({timeout:30000});await expect(old.locator('.result-card')).toContainText('RECOVERY_PRESERVES_OTHER_TAB');
    let next;for(const worker of context.serviceWorkers())if(await worker.evaluate(()=>self.__LDP_BUILD__?.id)===builds.B.manifest.id)next=worker;expect(next).toBeDefined();
    await old.close();await recovery.close();await expect.poll(()=>next.evaluate(()=>!self.registration.waiting&&self.registration.active?.state==='activated'),{timeout:30000}).toBe(true);
    const page=await context.newPage();await page.goto(base);await expect(page.getByRole('heading',{name:'PWA fixture B',exact:true})).toBeVisible();
  }finally{await context.close();}
});
