// Repeatable cross-project smoke check with the existing MKB dev broker and
// a fresh browser context. It never connects to the user's production pairing.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {convert,withLdp,noteInput} from './host.mjs';

const workspace=fileURLToPath(new URL('../../',import.meta.url));
const repo=process.argv[2];
if (!repo) throw new Error('Pass the markdown-knowledge-board checkout as the first argument.');
const port=Number(process.env.LDP_TEST_MKB_PORT ?? 5198);
const appDist=resolve(repo,'dist');
await access(resolve(appDist,'index.html'));
const origin='http://127.0.0.1:'+port;
const selected={selection:{mode:'range',start:2,end:3}};
const converted=await withLdp({workspace},call=>convert(call,{kind:'project_file',path:'tests/fixtures/pdf/three-page-range.pdf'},selected));
const note=noteInput(converted,selected,{title:'LDP integration fixture'});
const client=new Client({name:'ldp-integration-test',version:'0.1.0'});
let browser;
async function call(name,args={}) {
  const result=await client.callTool({name,arguments:args});
  if (result.isError && name==='create_note') throw new Error('MKB create_note: '+result.content[0].text);
  assert.equal(result.isError,false);
  return JSON.parse(result.content[0].text);
}
try {
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[resolve(repo,'tools/local-mcp/server.mjs')],cwd:resolve(repo),stderr:'pipe',
    env:{MKB_MCP_DEV:'1',MKB_MCP_PORT:String(port)}}));
  const setup=await call('connection_status');
  assert.equal(setup.origin,origin);
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  // Load the existing MKB build while the real dev broker handles its own API.
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if (url.origin!==origin) return route.abort();
    if (url.pathname.startsWith('/__local_mcp/')) return route.continue();
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if (!/^(?:(?:assets|icons)\/)?[\w.-]+$/.test(file) || file==='..') return route.fulfill({status:404});
    try {
      await route.fulfill({path:resolve(appDist,file)});
    } catch {
      await route.fulfill({status:404});
    }
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Open application menu'}).click();
  await page.getByRole('menuitem',{name:'Local MCP',exact:true}).click();
  await page.getByLabel('Connection code',{exact:true}).fill(setup.pairingCode);
  await page.getByRole('button',{name:'Connect local MCP',exact:true}).click();
  await page.getByRole('button',{name:'MCP connected: connection settings',exact:true}).waitFor();
  const saved=await call('create_note',note);
  assert.equal(saved.status,'saved');
  assert.equal(saved.reused,false);
  const repeated=await call('create_note',note);
  assert.equal(repeated.id,saved.id);
  assert.equal(repeated.reused,true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.note-title',{hasText:note.title}).waitFor();
  const stored=await page.evaluate(async id=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('markdown-knowledge-board');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try {
      return await new Promise((resolve,reject)=>{
        const request=db.transaction('notes').objectStore('notes').get(id);
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
    } finally {db.close();}
  },saved.id);
  assert.equal(stored.title,note.title);
  assert.equal(stored.body,note.markdown);
  console.log('PASS: real LDP output, MKB saved receipt, identical retry and persisted body after browser reload.');
} finally {
  await browser?.close();
  await client.close();
}
