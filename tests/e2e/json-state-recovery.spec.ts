import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
const json=(name:string,text:string)=>({name,mimeType:'application/json',buffer:Buffer.from(text)});
const ready=(page:Page)=>expect(page.getByRole('status').filter({hasText:'対象と出力スタイルの確認が完了しました。'})).toBeVisible();
const row=(page:Page,name:string)=>page.locator('.file-list > li').filter({has:page.getByText(name,{exact:true})});
const card=(page:Page,name:string)=>page.locator('.result-card').filter({has:page.getByRole('heading',{name,exact:true})});
async function confirm(page:Page,mermaid=false){await ready(page);if(mermaid){await page.getByRole('radio',{name:'Mermaid構造図',exact:true}).check();await ready(page);}await page.getByRole('button',{name:'この設定に決定',exact:true}).click();}

test('SR-10 UI-26 display-only failure keeps verified exports and explicit retry recovers',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  try{
    await page.addInitScript(()=>{
      const original=DOMParser.prototype.parseFromString;
      (window as Window & {svgFaults?:number}).svgFaults=0;
      DOMParser.prototype.parseFromString=function(source,type){
        const state=window as Window & {svgFaults?:number};
        if(type==='image/svg+xml'&&String(source).includes('standard-')&&state.svgFaults===0){state.svgFaults++;throw new Error('synthetic-svg-failure');}
        return original.call(this,source,type);
      };
    });
    await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('verified.json','{"verified":"VERIFIED_VALUE"}'));await confirm(page,true);
    await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(card(page,'verified.json')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'図を再試行',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Markdown をダウンロード',exact:true})).toBeEnabled();
    await expect(page.locator('.json-source')).toContainText('VERIFIED_VALUE');
    expect(await page.evaluate(()=>(window as Window & {svgFaults?:number}).svgFaults)).toBe(1);
    await page.getByRole('button',{name:'図を再試行',exact:true}).click();await expect(page.locator('.json-svg svg')).toBeVisible();
    await expect(card(page,'verified.json')).toHaveCount(1);
  }finally{await context.close();}
});

test('SR-11 UI-26 validation asset failure blocks output, preserves another result and only explicit reconversion recovers',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let blocked=true,faults=0;
  try{
    await context.route('**/assets/mermaid.core-*.js',async route=>{if(blocked){faults++;await route.abort('failed');}else await route.continue();});
    await page.goto('/');await page.locator('input[type=file]').setInputFiles([json('A.json','{"case":"PRESERVED_A"}'),json('B.json','{"case":"RECOVERED_B"}')]);
    await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0);
    await row(page,'B.json').getByRole('button',{name:'変更',exact:true}).click();await confirm(page,true);
    await page.getByRole('button',{name:'2 ファイルを変換',exact:true}).click();await expect(row(page,'B.json')).toContainText('変換できませんでした');
    await expect(row(page,'B.json')).toContainText('「変更」で設定を再確認して確定');
    expect(faults).toBeGreaterThan(0);await expect(card(page,'A.json')).toContainText('PRESERVED_A');await expect(card(page,'B.json')).toHaveCount(0);
    blocked=false;await context.setOffline(true);await context.setOffline(false);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(card(page,'B.json')).toHaveCount(0);await expect(row(page,'B.json')).toContainText('変換できませんでした');
    await row(page,'B.json').getByRole('button',{name:'変更',exact:true}).click();await confirm(page,true);
    await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(card(page,'B.json')).toContainText('RECOVERED_B');await expect(page.locator('.json-svg svg')).toBeVisible();
    await expect(card(page,'A.json')).toContainText('PRESERVED_A');
  }finally{await context.close();}
});

test('SR-12 target reload failure has explicit retry; delayed obsolete target never enables confirmation',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let injected=0;
  try{
    await context.route('**/assets/json.worker-*.js',async route=>{
      injected++;const response=await route.fetch(),body=await response.text();
      await route.fulfill({response,body:body+'\nconst handle=self.onmessage;let fault=true;self.onmessage=e=>{if(e.data.operation==="target"&&fault){fault=false;self.postMessage({...e.data,buffer:undefined,error:"initializationFailed"});return;}handle(e);};const post=self.postMessage.bind(self);self.postMessage=m=>{if(m.operation==="target"&&m.settings.pointer==="/slow")setTimeout(()=>post(m),500);else post(m);};'});
    });
    await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('retry.json','{"slow":{"OBSOLETE":1},"fast":{"CURRENT":2}}'));
    await expect(page.getByRole('button',{name:'JSONを再読込',exact:true})).toBeVisible();expect(injected).toBeGreaterThan(0);
    await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'JSONを再読込',exact:true}).click();await ready(page);
    await page.getByRole('radio',{name:'"slow"',exact:true}).check();await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeDisabled();
    await page.getByRole('radio',{name:'"fast"',exact:true}).check();
    // A new Worker also receives the one-shot read fault; recover without resetting the draft.
    await expect(page.getByRole('button',{name:'JSONを再読込',exact:true})).toBeVisible();await page.getByRole('button',{name:'JSONを再読込',exact:true}).click();await ready(page);
    await expect(page.locator('.json-full-pointer')).toHaveText('"/fast"');await expect(page.locator('.json-target-detail')).toContainText('CURRENT');await expect(page.locator('.json-target-detail')).not.toContainText('OBSOLETE');
    await confirm(page);await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(card(page,'retry.json')).toContainText('CURRENT');await expect(card(page,'retry.json')).not.toContainText('OBSOLETE');
  }finally{await context.close();}
});

test('SR-13 twenty files reuse only the current parse and preserve independent settings and results',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  try{
    await page.addInitScript(()=>{
      const Native=Worker,state={inputs:0,releases:0};(window as Window & {jsonTraffic?:typeof state}).jsonTraffic=state;
      window.Worker=class extends Native{
        constructor(url:URL|string,options?:WorkerOptions){super(url,options);if(String(url).includes('json.worker-')){
          const post=this.postMessage.bind(this);this.postMessage=((message:Record<string,unknown>,transfer:Transferable[])=>{if(message.buffer)state.inputs++;if(message.operation==='release')state.releases++;post(message,transfer);}) as typeof this.postMessage;
        }}
      };
    });
    await page.goto('/');await page.locator('input[type=file]').setInputFiles(Array.from({length:20},(_,i)=>json(`F${i}.json`,JSON.stringify({value:`VALUE_${String(i).padStart(2,'0')}`}))));
    await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as Window & {jsonTraffic?:unknown}).jsonTraffic)).toEqual({inputs:20,releases:19});
    await row(page,'F0.json').getByRole('button',{name:'変更',exact:true}).click();await ready(page);
    const before=await page.evaluate(()=>(window as Window & {jsonTraffic?:{inputs:number}}).jsonTraffic?.inputs);
    await page.getByRole('button',{name:'JSON詳細を開く',exact:true}).click();await ready(page);expect(await page.evaluate(()=>(window as Window & {jsonTraffic?:{inputs:number}}).jsonTraffic?.inputs)).toBe(before);
    await confirm(page);await page.getByRole('button',{name:'20 ファイルを変換',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(20);
    for(let i=0;i<20;i++){await expect(card(page,`F${i}.json`)).toContainText(`VALUE_${String(i).padStart(2,'0')}`);await expect(card(page,`F${i}.json`)).not.toContainText(`VALUE_${String((i+1)%20).padStart(2,'0')}`);}
    await page.getByRole('button',{name:'すべてクリア',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(0);await expect(page.locator('.file-list')).toHaveCount(0);
  }finally{await context.close();}
});

test('SR-19 UI-11 table pages contain 100/1 rows while MD and TXT exports retain all 101 records',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as Window & {copiedRows?:number}).copiedRows=(text.match(/ROW_\d{3}/g)??[]).length;}}});});
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('rows.json',JSON.stringify(Array.from({length:101},(_,i)=>({id:`ROW_${String(i).padStart(3,'0')}`})))));
  await ready(page);await page.getByRole('radio',{name:'一覧表',exact:true}).check();await confirm(page);
  await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(page.locator('.markdown-preview tbody tr')).toHaveCount(100);
  await expect(page.locator('.markdown-preview')).not.toContainText('ROW_100');await page.getByRole('button',{name:'表の次の100行',exact:true}).click();
  await expect(page.locator('.markdown-preview tbody tr')).toHaveCount(1);await expect(page.locator('.markdown-preview')).toContainText('ROW_100');
  await page.getByRole('button',{name:'Markdown をコピー',exact:true}).click();expect(await page.evaluate(()=>(window as Window & {copiedRows?:number}).copiedRows)).toBe(101);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Markdown をダウンロード',exact:true}).click();
  const markdown=Buffer.concat(await (await (await download).createReadStream())!.toArray()).toString('utf8');
  expect(markdown).toContain('ROW_000');expect(markdown).toContain('ROW_100');expect(markdown.match(/ROW_\d{3}/g)).toHaveLength(101);
  await page.getByRole('tab',{name:'plain text',exact:true}).click();await expect(page.locator('.plain-preview')).toContainText('ROW_000');await expect(page.locator('.plain-preview')).toContainText('ROW_100');
  await page.evaluate(()=>{(window as Window & {copiedRows?:number}).copiedRows=0;});await page.getByRole('button',{name:'plain text をコピー',exact:true}).click();expect(await page.evaluate(()=>(window as Window & {copiedRows?:number}).copiedRows)).toBe(101);
  const txtDownload=page.waitForEvent('download');await page.getByRole('button',{name:'plain text をダウンロード',exact:true}).click();
  const text=Buffer.concat(await (await (await txtDownload).createReadStream())!.toArray()).toString('utf8');expect(text.match(/ROW_\d{3}/g)).toHaveLength(101);
});

test('SR-20 UI-14/17 JSON A survives PDF B cancellation and file-specific settings reparse without restarting the queue',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let injected=0;
  try{
    await context.route('**/assets/converter.worker-*.js',async route=>{
      injected++;const response=await route.fetch(),body=await response.text();
      await route.fulfill({response,body:body+'\nconst post=self.postMessage.bind(self);self.postMessage=m=>{if(m.type==="convert-success")setTimeout(()=>post(m),2000);else post(m);};'});
    });
    await page.goto('/');await page.locator('input[type=file]').setInputFiles([json('A.json','{"keep":{"value":"PRESERVED_A"},"outside":"OUTSIDE_A"}'),{name:'B.pdf',mimeType:'application/pdf',buffer:await (await import('node:fs/promises')).readFile(resolve('tests/fixtures/pdf/three-page-range.pdf'))},json('C.json','{"value":"RECOVERED_C"}')]);
    await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0);expect(injected).toBeGreaterThan(0);
    await row(page,'B.pdf').getByRole('button',{name:'変更',exact:true}).click();await page.getByRole('radio',{name:'範囲を指定',exact:true}).check();await page.getByLabel('開始').fill('2');await page.getByLabel('終了').fill('2');await page.getByRole('button',{name:'この範囲に決定',exact:true}).click();
    await row(page,'A.json').getByRole('button',{name:'変更',exact:true}).click();await ready(page);await page.getByRole('radio',{name:'"keep"',exact:true}).check();await confirm(page);
    await page.getByRole('button',{name:'3 ファイルを変換',exact:true}).click();await expect(card(page,'A.json')).toContainText('PRESERVED_A');await expect(row(page,'B.pdf')).toContainText('変換中');
    await page.getByRole('button',{name:'変換をキャンセル',exact:true}).click();await expect(page.getByText('キャンセル済み',{exact:true})).toHaveCount(2);
    await row(page,'A.json').getByRole('button',{name:'変更',exact:true}).click();await ready(page);await expect(page.locator('.json-full-pointer')).toHaveText('"/keep"');await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    await expect(card(page,'A.json')).not.toContainText('OUTSIDE_A');await row(page,'B.pdf').getByRole('button',{name:'変更',exact:true}).click();await expect(page.getByLabel('開始')).toHaveValue('2');await expect(page.getByLabel('終了')).toHaveValue('2');await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    await expect(card(page,'A.json')).toContainText('PRESERVED_A');await row(page,'C.json').getByRole('button',{name:'変更',exact:true}).click();await confirm(page,true);
    await expect(card(page,'C.json')).toHaveCount(0);await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(card(page,'C.json')).toContainText('RECOVERED_C');await expect(card(page,'A.json')).toContainText('PRESERVED_A');await expect(card(page,'B.pdf')).toHaveCount(0);
  }finally{await context.close();}
});
