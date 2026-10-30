import {test,expect,type CDPSession} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Opt-in synthetic load measurement, excluded from ordinary CI/E2E runs.
// The longer budget covers several 50 MiB parses and explicit GC observations.
test('SR-14 synthetic maximum inputs with completed results, WASM and diagram assets release evicted JSON heaps',async({browser})=>{
  test.skip(process.env.JSON_RETENTION!=='1','Opt-in synthetic load measurement; device proof remains separate');
  test.setTimeout(120000);
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  const root=await browser.newBrowserCDPSession(),main=await context.newCDPSession(page);
  const samples:Record<string,unknown>[]=[],wasm=new Set<string>(),loadDurations:{fixture:string;milliseconds:number}[]=[];let commandId=0;
  const responsiveness:{phase:string;maximumTimerGapMs:number}[]=[];
  page.on('request',request=>{if(request.url().endsWith('.wasm'))wasm.add(request.url().includes('pdfium')?'pdfium':'anydoc');});
  async function workerMetric(targetId:string,gc:boolean){
    const {sessionId}=await root.send('Target.attachToTarget',{targetId,flatten:false});
    const send=(method:string)=>new Promise<Record<string,number>>((complete,fail)=>{
      const id=++commandId;
      const listener=(event:{sessionId:string;message:string})=>{
        if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);
        if(message.id!==id)return;clearTimeout(timer);root.off('Target.receivedMessageFromTarget',listener);
        if(message.error)fail(new Error('worker-metric-failed'));else complete(message.result);
      };
      const timer=setTimeout(()=>{root.off('Target.receivedMessageFromTarget',listener);fail(new Error('worker-metric-timeout'));},5000);
      root.on('Target.receivedMessageFromTarget',listener);
      void root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method})}).catch(()=>{clearTimeout(timer);root.off('Target.receivedMessageFromTarget',listener);fail(new Error('worker-metric-unavailable'));});
    });
    try{if(gc)await send('HeapProfiler.collectGarbage');return await send('Runtime.getHeapUsage');}
    finally{await root.send('Target.detachFromTarget',{sessionId});}
  }
  async function sample(phase:string,gc=false){
    if(gc)await main.send('HeapProfiler.collectGarbage');
    const targets=await root.send('Target.getTargets');
    const workers:{kind:string;heap:Record<string,number>}[]=[];
    for(const target of targets.targetInfos.filter((target:{type:string;url:string})=>target.type==='worker'&&/json.worker-|converter.worker-/.test(target.url))){
      workers.push({kind:target.url.includes('json.worker-')?'json':'document',heap:await workerMetric(target.targetId,gc)});
    }
    const result={phase,gc,page:await main.send('Runtime.getHeapUsage'),workers};samples.push(result);return result;
  }
  // Maximum-size parsing uses the client's existing 30s deadline. Keep ordinary
  // UI assertions at their default budget and record the actual load duration.
  const ready=()=>expect(page.getByRole('status').filter({hasText:'対象と出力スタイルの確認が完了しました。'})).toBeVisible({timeout:30000});
  const open=async(name:string)=>{const start=Date.now();await page.locator('.file-list > li').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'変更',exact:true}).click();await ready();loadDurations.push({fixture:name,milliseconds:Date.now()-start});};
  const close=()=>page.getByRole('button',{name:'キャンセル',exact:true}).click();
  const jsonBytes=(sample:{workers:{kind:string;heap:Record<string,number>}[]})=>{const heap=sample.workers.find(worker=>worker.kind==='json')!.heap;return heap.usedSize+(heap.backingStorageSize??0);};
  try{
    await page.addInitScript(()=>{
      const state={last:performance.now(),maximum:0};(window as Window & {retentionTiming?:typeof state}).retentionTiming=state;
      setInterval(()=>{const now=performance.now();state.maximum=Math.max(state.maximum,now-state.last);state.last=now;},100);
    });
    const resetTiming=()=>page.evaluate(()=>{const state=(window as Window & {retentionTiming?:{last:number;maximum:number}}).retentionTiming!;state.last=performance.now();state.maximum=0;});
    const captureTiming=async(phase:string)=>{responsiveness.push({phase,maximumTimerGapMs:await page.evaluate(()=>(window as Window & {retentionTiming?:{maximum:number}}).retentionTiming!.maximum)});};
    await page.goto('/');await sample('baseline',true);
    const pdf=Array.from(await readFile(resolve('tests/fixtures/pdf/normal-machine-readable.pdf')));
    await page.evaluate(bytes=>{
      const transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)],'sample.pdf',{type:'application/pdf'}));
      transfer.items.add(new File(['a,b\nCSV_VALUE,2\n'],'sample.csv',{type:'text/csv'}));
      transfer.items.add(new File(['{"diagram":"SMALL_VALUE"}'],'small.json',{type:'application/json'}));
      const giant=new Uint8Array(50*1024**2);giant.fill(120);giant[0]=34;giant[giant.length-1]=34;
      transfer.items.add(new File([giant],'maximum.json',{type:'application/json'}));
      transfer.items.add(new File([JSON.stringify(Array.from({length:99999},()=>null))],'nodes.json',{type:'application/json'}));
      transfer.items.add(new File(['"','z'.repeat(9*1024**2),'"'],'completed-large.json',{type:'application/json'}));
      const input=document.querySelector<HTMLInputElement>('input[type=file]')!;input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    },pdf);
    await expect(page.getByText('構造確認中',{exact:true})).toHaveCount(0,{timeout:30000});
    await expect(page.getByRole('button',{name:'4 ファイルを変換',exact:true})).toBeEnabled();
    await open('small.json');await page.getByRole('radio',{name:'Mermaid構造図',exact:true}).check();await ready();await page.getByRole('button',{name:'この設定に決定',exact:true}).click();
    await resetTiming();
    await page.getByRole('button',{name:'4 ファイルを変換',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(4,{timeout:30000});await expect(page.locator('.json-svg svg')).toBeVisible();
    const largeCard=page.locator('.result-card').filter({has:page.getByRole('heading',{name:'completed-large.json',exact:true})});
    await expect(largeCard).toContainText('Markdownの先頭10,000文字を抜粋表示');
    expect(await largeCard.locator('.plain-preview').evaluate(el=>Array.from(el.textContent??'').length)).toBe(10000);
    const download=page.waitForEvent('download');await largeCard.getByRole('button',{name:'Markdown をダウンロード',exact:true}).click();
    const downloaded=Buffer.concat(await (await (await download).createReadStream())!.toArray()).toString('utf8');expect(downloaded.includes('z'.repeat(9*1024**2))).toBe(true);
    await largeCard.getByRole('tab',{name:'plain text',exact:true}).click();await expect(largeCard).toContainText('plain textは先頭10,000文字');expect(await largeCard.locator('.plain-preview').evaluate(el=>Array.from(el.textContent??'').length)).toBe(10000);
    await largeCard.getByRole('tab',{name:'Markdown',exact:true}).click();
    await captureTiming('conversion-and-initial-preview');
    expect([...wasm].sort()).toEqual(['anydoc','pdfium']);await sample('completed-results-and-assets',true);
    const drops:number[]=[];
    for(let cycle=0;cycle<3;cycle++){
      await open('maximum.json');await expect(page.getByRole('button',{name:'この設定に決定',exact:true})).toBeDisabled();
      await expect(page.getByRole('alert').filter({hasText:'入力を分割・縮小'})).toBeVisible();
      await sample(`maximum-${cycle}-before-gc`);const large=await sample(`maximum-${cycle}-after-gc`,true);
      // Detail expansion survives cancel/reopen for the same File identity.
      const detail=page.getByRole('button',{name:/^JSON詳細を/});
      if(await detail.getAttribute('aria-expanded')==='false'){await detail.click();await ready();}
      expect(await page.locator('.json-detail-source').evaluate(el=>Array.from(el.textContent??'').length)).toBe(10000);
      await close();await open('small.json');const small=await sample(`evicted-${cycle}-after-gc`,true);await close();
      const drop=jsonBytes(large)-jsonBytes(small);drops.push(drop);expect(drop).toBeGreaterThan(40*1024**2);
      await expect(page.locator('.result-card')).toHaveCount(4);
    }
    await open('nodes.json');await sample('100000-nodes-before-gc');await sample('100000-nodes-after-gc',true);await close();
    await page.getByRole('button',{name:'すべてクリア',exact:true}).click();await expect(page.locator('.result-card')).toHaveCount(0);
    const cleared=await sample('cleared-after-gc',true);expect(cleared.workers.some(worker=>worker.kind==='json')).toBe(false);
    const report={schema:1,environment:{platform:process.platform,browser:browser.version(),channel:process.env.PLAYWRIGHT_CHANNEL??'chromium',headless:true},fixtures:{maximumBytes:50*1024**2,maximumNodes:100000,completedResults:4,completedPayloadBytes:9*1024**2,cycles:3},wasm:[...wasm].sort(),jsonHeapDropsBytes:drops,loadDurations,responsiveness,samples,limitations:['Synthetic Windows/headless measurement; not physical-device acceptance','Snapshots include JS heap and backing storage; not true transient peaks, process RSS or complete WASM/native allocations','Explicit GC is a diagnostic observation, not a production release guarantee','100ms timer gaps are observations, not a hard responsiveness guarantee']};
    await writeFile(resolve(`docs/evidence/json-state-retention-${process.env.PLAYWRIGHT_CHANNEL??'chromium'}.json`),JSON.stringify(report,null,2)+'\n');
  }finally{await main.detach().catch(()=>{});await root.detach().catch(()=>{});await context.close();}
});
