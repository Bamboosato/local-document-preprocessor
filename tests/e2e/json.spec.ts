import {test,expect,type Page} from '@playwright/test';
const json=(name:string,text:string)=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(text)});
const fixture='{ "a/b": {"~key":9007199254740993,"n":-0,"s":"hello"}, "outside":"NOT_SELECTED" }';
const dialog=(page:Page)=>page.getByRole('dialog',{name:'JSONの変換設定'});
async function confirm(page:Page,style='items'){
  await expect(dialog(page)).toBeVisible();await page.getByRole('radio',{name:({items:'項目表',records:'一覧表',mermaid:'Mermaid構造図'} as Record<string,string>)[style],exact:true}).check();
  await page.getByRole('button',{name:'この設定に決定'}).click();await expect(dialog(page)).not.toBeVisible();
}
async function convert(page:Page){await page.getByRole('button',{name:/^\d+ ファイルを変換$/}).click();await expect(page.locator('.result-card')).toHaveCount(1);}

test('JC-03 JSON selected subtree preserves numeric tokens in MD/TXT downloads without WASM or external requests',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as Window & {copiedFixture?:string}).copiedFixture=value;}}});});
  const wasm:string[]=[],external:string[]=[];page.on('request',r=>{if(r.url().endsWith('.wasm'))wasm.push('wasm');const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.hostname!=='127.0.0.1')external.push('external');});
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('fixture.JSON',fixture));await expect(dialog(page)).toBeVisible();
  await page.getByRole('radio',{name:'"a/b"',exact:true}).check();await confirm(page);await convert(page);
  const card=page.locator('.result-card');await expect(card).toContainText('9007199254740993');await expect(card).not.toContainText('NOT_SELECTED');
  await card.getByRole('button',{name:'Markdown をコピー',exact:true}).click();expect(await page.evaluate(()=>{const text=(window as Window & {copiedFixture?:string}).copiedFixture;return Boolean(text?.includes('9007199254740993'))&&!text?.includes('originalUpdatedAt:');})).toBe(true);
  const mdPromise=page.waitForEvent('download');await card.getByRole('button',{name:'Markdown をダウンロード'}).click();const md=await mdPromise;const mdText=await (await md.createReadStream())!.toArray();const content=Buffer.concat(mdText).toString('utf8');expect(content).toContain('title: "fixture.JSON"');expect(content).toContain('9007199254740993');expect(content).toContain('/a~1b');
  await card.getByRole('tab',{name:'plain text',exact:true}).click();const txtPromise=page.waitForEvent('download');await card.getByRole('button',{name:'plain text をダウンロード'}).click();const txt=await txtPromise;const text=Buffer.concat(await (await txt.createReadStream())!.toArray()).toString('utf8');expect(text).not.toContain('originalUpdatedAt:');expect(text).toContain('9007199254740993');expect(text).toContain('-0');expect(wasm).toHaveLength(0);expect(external).toHaveLength(0);
});

test('JC-03 JSON Mermaid uses standard SVG under product CSP; source/plain text remain available',async({page})=>{
  const errors:string[]=[];page.on('pageerror',()=>errors.push('pageerror'));await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('diagram.json','{"safe":"<img src=x onerror=alert(1)>","emoji":"😀"}'));await confirm(page,'mermaid');await convert(page);
  await expect(page.locator('.json-svg svg')).toBeVisible();await expect(page.locator('.json-svg .node')).toHaveCount(3);await expect(page.locator('.json-svg script,.json-svg foreignObject,.json-svg image')).toHaveCount(0);
  await page.getByRole('button',{name:'Mermaidソース',exact:true}).click();await expect(page.locator('.json-source')).toContainText('flowchart TD');await page.getByRole('tab',{name:'plain text',exact:true}).click();await expect(page.locator('.plain-preview')).toContainText('flowchart TD');expect(errors).toHaveLength(0);
});

test('JC-04 JSON records, draft cancel, confirmed invalidation and fresh settings do not mix results',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('records.json','[{"a":1},{"b":2}]'));await confirm(page,'records');await convert(page);await expect(page.locator('.result-card')).toContainText('（項目なし）');
  await page.getByRole('button',{name:'変更',exact:true}).click();await page.getByRole('radio',{name:'Mermaid構造図',exact:true}).check();await page.getByRole('button',{name:'キャンセル',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(1);
  await page.getByRole('button',{name:'変更',exact:true}).click();await confirm(page,'mermaid');await expect(page.locator('.result-card')).toHaveCount(0);await convert(page);await expect(page.locator('.json-svg svg')).toBeVisible();await page.getByRole('button',{name:'すべてクリア'}).click();await expect(page.locator('.result-card')).toHaveCount(0);await page.reload();await expect(page.locator('.file-list')).toHaveCount(0);
});

test('JC-04 mixed JSON CSV JSON and malformed file continue sequentially without cross-file contamination',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles([json('A.json','{"case":"CASE_A"}'),{name:'B.csv',mimeType:'text/csv',buffer:Buffer.from('name,value\nCASE_B,2\n')},json('bad.json','{"duplicate":1,"duplicate":2}'),json('C.json','{"case":"CASE_C"}')]);
  await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0,{timeout:30000});await page.getByRole('button',{name:'3 ファイルを変換',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(3,{timeout:30000});
  for(const [name,marker]of [['A.json','CASE_A'],['B.csv','CASE_B'],['C.json','CASE_C']]){const card=page.locator('.result-card').filter({has:page.getByRole('heading',{name,exact:true})});await expect(card).toContainText(marker);for(const other of ['CASE_A','CASE_B','CASE_C'].filter(v=>v!==marker))await expect(card).not.toContainText(other);}
  await expect(page.getByText('JSONを検査できませんでした。UTF-8、構文、重複キー、文字列のUnicodeを確認してください。')).toBeVisible();
  await page.locator('.file-list > li').filter({hasText:'A.json'}).getByRole('button',{name:'変更',exact:true}).click();await confirm(page,'mermaid');await expect(page.locator('.result-card')).toHaveCount(2);
  await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(3);await expect(page.locator('.json-svg svg')).toBeVisible();
  await expect(page.locator('.result-card').filter({has:page.getByRole('heading',{name:'B.csv',exact:true})})).toContainText('CASE_B');await expect(page.locator('.result-card').filter({has:page.getByRole('heading',{name:'C.json',exact:true})})).toContainText('CASE_C');
});

test('JC-03 JSON real generated source above display limit still exports verified text',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(json('large.json',JSON.stringify(Array.from({length:180},()=> '漢'.repeat(70)))));await confirm(page,'mermaid');await convert(page);await expect(page.locator('.json-diagram')).toContainText('50 KiBを超える');await expect(page.locator('.json-svg svg')).toHaveCount(0);await expect(page.getByRole('button',{name:'Markdown をダウンロード'})).toBeEnabled();
});

test('JC-04 cancellation preserves completed JSON and cancels active/waiting files',async({browser})=>{
  // Isolate network fault injection from the production SW's static cache.
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let injected=0;
  try{
  await page.route('**/assets/json.worker-*.js',async route=>{
    injected++;
    const response=await route.fetch();const body=await response.text();
    await route.fulfill({response,body:body+'\nconst post=self.postMessage.bind(self);self.postMessage=(message)=>{if(message.operation==="convert")setTimeout(()=>post(message),1500);else post(message);};'});
  });
  await page.goto('/');await page.locator('input[type=file]').setInputFiles([json('A.json','{"case":"A"}'),json('B.json','{"case":"B"}'),json('C.json','{"case":"C"}')]);
  await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0);expect(injected).toBeGreaterThan(0);await page.getByRole('button',{name:'3 ファイルを変換',exact:true}).click();
  await expect(page.locator('.result-card')).toHaveCount(1);const rowB=page.locator('.file-list > li').filter({hasText:'B.json'});await expect(rowB).toContainText('変換中');
  await page.getByRole('button',{name:'変換をキャンセル',exact:true}).click();await expect(page.getByText('キャンセル済み',{exact:true})).toHaveCount(2);await expect(page.locator('.result-card')).toHaveCount(1);await expect(page.locator('.result-card h3')).toHaveText('A.json');
  }finally{await context.close();}
});
