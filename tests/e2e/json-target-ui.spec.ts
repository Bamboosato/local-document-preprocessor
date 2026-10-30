import {test,expect,type Page} from '@playwright/test';
const data=(text:string)=>({name:'TU.json',mimeType:'application/json',buffer:Buffer.from(text)});
const ready=(page:Page)=>expect(page.getByRole('status').filter({hasText:'対象と出力スタイルの確認が完了しました。'})).toBeVisible();
const root=(page:Page)=>page.getByRole('radio',{name:'ファイル全体（ルート）',exact:true});

test('TU-07 paging, details, reveal and cancel preserve selection/style independently',async({page})=>{
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(data(JSON.stringify(Array.from({length:51},(_,i)=>({id:i})))));
  await ready(page);await expect(root(page)).toBeChecked();
  await page.getByRole('button',{name:'ファイル全体（ルート）の次の50項目',exact:true}).click();await ready(page);
  await expect(root(page)).toBeChecked();await page.getByRole('radio',{name:'"50"',exact:true}).check();await ready(page);
  await expect(page.locator('.json-full-pointer')).toHaveText('"/50"');
  await page.getByRole('button',{name:'ファイル全体（ルート）を閉じる',exact:true}).click();await ready(page);
  await expect(page.getByRole('radio',{name:'"50"',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'選択位置を表示',exact:true}).click();await ready(page);
  const selected=page.getByRole('radio',{name:'"50"',exact:true});await expect(selected).toBeChecked();await expect(selected).toBeFocused();
  await selected.press('Tab');await expect(selected).toBeChecked();
  await page.getByRole('button',{name:'JSON詳細を開く',exact:true}).click();await ready(page);await expect(page.locator('.json-detail-source')).toContainText('50');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'変更',exact:true}).click();await ready(page);await expect(root(page)).toBeChecked();
});

test('TU-08 selected incompatible style remains checked and blocks confirmation until compatible again',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(data('{"good":[{"a":1}],"bad":{}}'));await ready(page);
  await expect(page.getByRole('radio',{name:'一覧表',exact:true})).toBeDisabled();
  await page.getByRole('radio',{name:'"good"',exact:true}).check();await ready(page);
  await page.getByRole('radio',{name:'一覧表',exact:true}).check();await ready(page);
  await page.getByRole('radio',{name:'"bad"',exact:true}).check();await ready(page);
  await expect(page.getByRole('radio',{name:'一覧表',exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeDisabled();
  await expect(page.locator('.json-style-choice').filter({has:page.getByRole('radio',{name:'一覧表',exact:true})})).toContainText('生成不可');
  await page.getByRole('radio',{name:'"good"',exact:true}).check();await ready(page);
  await expect(page.getByRole('radio',{name:'一覧表',exact:true})).toBeChecked();await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeEnabled();
});

test('TU-09 long keys, bounded detail and ten-item summaries are inspectable without output truncation',async({page})=>{
  const prefix='same'.repeat(100),a=prefix+'A/~',b=prefix+'B/~';
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(data(JSON.stringify({[a]:{},[b]:{value:'😀'.repeat(10001),...Object.fromEntries(Array.from({length:10},(_,i)=>['k'+i,i]))}})));await ready(page);
  await page.getByRole('radio',{name:JSON.stringify(b),exact:true}).check();await ready(page);
  await expect(page.locator('.json-full-pointer')).toHaveText(JSON.stringify('/'+b.replace(/~/g,'~0').replace(/\//g,'~1')));
  await expect(page.locator('.json-detail-children li')).toHaveCount(10);
  await page.getByRole('button',{name:'詳細の次の10項目',exact:true}).click();await ready(page);await expect(page.locator('.json-detail-children li')).toHaveCount(1);
  await page.getByRole('button',{name:'JSON詳細を開く',exact:true}).click();await ready(page);
  expect(await page.locator('.json-detail-source').evaluate(el=>Array.from(el.textContent??'').length)).toBe(10000);
  await expect(page.getByText('先頭10,000文字の抜粋です。変換出力の省略ではありません。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'この設定に決定',exact:true}).click();await page.getByRole('button',{name:'1 ファイルを変換',exact:true}).click();
  await expect(page.locator('.result-card')).toHaveCount(1);await expect(page.locator('.result-card')).toContainText('k9');
});

test('TU-10 virtual windows never mount more than 300 rows and restore an offscreen selected radio',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(data(JSON.stringify(Array.from({length:8},()=>Array.from({length:45},()=>({}))))));await ready(page);
  // Expand from the end so each next parent stays in the current DOM window.
  for(let i=7;i>=0;i--) {await page.getByRole('button',{name:`"${i}"を開く`,exact:true}).click();await ready(page);}
  await expect(page.locator('.json-tree-row')).toHaveCount(300);
  await page.locator('.json-virtual-tree').evaluate(el=>{el.scrollTop=el.scrollHeight;});await ready(page);
  const last=page.getByRole('radio',{name:'"44"',exact:true}).last();await last.check();await ready(page);
  const pointer=await page.locator('.json-full-pointer').textContent();
  await page.locator('.json-virtual-tree').evaluate(el=>{el.scrollTop=0;});await ready(page);await expect(page.locator('.json-tree-row')).toHaveCount(300);
  await expect(page.locator('.json-full-pointer')).toHaveText(pointer!);
  await root(page).focus();await page.keyboard.press('Tab');await expect(page.locator('.json-full-pointer')).toHaveText(pointer!);
  await page.getByRole('button',{name:'選択位置を表示',exact:true}).click();await ready(page);
  await expect(page.locator('input[name=json-target]:checked')).toBeFocused();
  expect(await page.locator('.json-tree-row').count()).toBeLessThanOrEqual(300);
});

test('TU-13 narrow desktop viewport keeps long-label controls reachable; background click discards draft',async({page})=>{
  await page.setViewportSize({width:320,height:740});await page.goto('/');
  const key='long'.repeat(100);
  await page.locator('input[type=file]').setInputFiles(data(JSON.stringify({[key]:{}})));await ready(page);
  await page.getByRole('radio',{name:JSON.stringify(key),exact:true}).check();await ready(page);
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'キャンセル',exact:true}).scrollIntoViewIfNeeded();
  await page.mouse.click(1,1);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'変更',exact:true}).click();await ready(page);await expect(root(page)).toBeChecked();
});
