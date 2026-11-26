import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,symlink,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {withLdp,convert,noteInput} from './host.mjs';
import {projectInput} from './source.mjs';

const workspace=fileURLToPath(new URL('../../',import.meta.url));
const pdf=name=>({kind:'project_file',path:'tests/fixtures/pdf/'+name+'.pdf'});
const inspect=(call,source)=>call('inspect_document',{source});

test('One STDIO connection discovers tools, selects PDF pages and prevents stale or failed output',async()=>{
  await withLdp({workspace},async(call,client)=>{
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['convert_document','inspect_document','read_result']);
    const options={selection:{mode:'range',start:2,end:3}};
    const range=await convert(call,pdf('three-page-range'),options);
    assert.equal(range.markdown,'PAGE_TWO_ONLY\n\n---\n\nPAGE_THREE_ONLY');
    assert.equal(range.doc.inspection.totalUnits,3);
    assert.equal(range.quality.pageCount,2);
    const mixed=await convert(call,pdf('mixed-text-image'));
    assert.equal(mixed.quality.disposition,'partial');
    assert.ok(mixed.quality.issues.some(issue=>issue.code==='mixed_pdf'));
    assert.ok(noteInput(mixed).markdown.includes('警告付き'));
    await assert.rejects(call('convert_document',{document_id:range.doc.document_id}),{code:'EXPIRED'});
    const image=await inspect(call,pdf('image-only'));
    await assert.rejects(call('convert_document',{document_id:image.document_id}),error=>
      error.code==='CONVERSION_FAILED' && error.quality.safeToExport===false);
    await assert.rejects(inspect(call,{kind:'project_file',path:'../outside.pdf'}),{code:'ACCESS_DENIED'});
    await assert.rejects(inspect(call,{kind:'attachment',attachment_id:'unknown'}),{code:'ATTACHMENT_UNAVAILABLE'});
  });
});

test('An attachment without a workspace preserves Unicode chunks and enforces cursor and note-size boundaries',async()=>{
  const input={id:randomUUID(),name:'記録.json',bytes:Buffer.from(JSON.stringify({sample:'資料🙋'.repeat(16000)}))};
  const source={kind:'attachment',attachment_id:input.id};
  await withLdp({attachment:input},async call=>{
    await assert.rejects(inspect(call,pdf('three-page-range')),{code:'WORKSPACE_UNAVAILABLE'});
    await assert.rejects(inspect(call,{...source,attachment_id:'other-chat'}),{code:'ACCESS_DENIED'});
    const doc=await inspect(call,source);
    const {next_cursor}=await call('convert_document',{document_id:doc.document_id});
    assert.ok(next_cursor);
    const first=await call('read_result',{cursor:next_cursor});
    assert.deepEqual(await call('read_result',{cursor:next_cursor}),first);
    const output=await convert(call,source);
    assert.ok(output.markdown.includes('資料🙋'.repeat(16000)));
    await assert.rejects(call('read_result',{cursor:next_cursor}),{code:'EXPIRED'});
    assert.throws(()=>noteInput(output),{code:'RESULT_TOO_LARGE'});
    const shortened={...output,markdown:'# Test'};
    const overhead=Buffer.byteLength(noteInput(shortened).markdown)-Buffer.byteLength(shortened.markdown);
    shortened.markdown='a'.repeat(131072-overhead);
    assert.equal(Buffer.byteLength(noteInput(shortened).markdown),131072);
    shortened.markdown+='a';
    assert.throws(()=>noteInput(shortened),{code:'RESULT_TOO_LARGE'});
  });
});

test('Selected Office units and the JSON diagram use the existing workers',async()=>{
  await withLdp({workspace},async call=>{
    const file=path=>({kind:'project_file',path:'tests/fixtures/office/'+path});
    const slides=await convert(call,file('three-slides.pptx'),{selection:{mode:'range',start:2,end:3}});
    assert.ok(slides.markdown.includes('SLIDE_TWO_ONLY') && !slides.markdown.includes('SLIDE_ONE_ONLY'));
    const source=file('three-sheets.xlsx');
    const {inspection}=await inspect(call,source);
    const sheets=await convert(call,source,{selection:{mode:'sheets',sheetNames:[inspection.sheets[1].name]}});
    assert.ok(sheets.markdown.includes('SHEET_TWO_ONLY') && !sheets.markdown.includes('SHEET_ONE_ONLY'));
  });
  const attachment={id:randomUUID(),name:'diagram.json',bytes:Buffer.from('{"main":{"amount":9007199254740993}}')};
  await withLdp({attachment},async call=>{
    const diagram=await convert(call,{kind:'attachment',attachment_id:attachment.id},{json:{pointer:'/main',style:'mermaid'}});
    assert.ok(diagram.markdown.includes('flowchart') && diagram.markdown.includes('9007199254740993'));
  });
});

test('The host observes busy, cancels an in-flight inspection and can inspect another document',async()=>{
  await withLdp({workspace},async(call,client)=>{
    const abort=new AbortController();
    const pending=client.callTool({name:'inspect_document',arguments:{source:pdf('three-page-range')}},undefined,{signal:abort.signal});
    await assert.rejects(inspect(call,pdf('image-only')),{code:'BUSY'});
    abort.abort();
    await assert.rejects(pending);
    // MCP cancellation acknowledges locally before the server has released its worker.
    let doc;
    for(let attempt=0;attempt<100 && !doc;attempt++){
      try {doc=await inspect(call,pdf('normal-machine-readable'));}
      catch(error){if(error.code!=='BUSY')throw error;await new Promise(resolve=>setTimeout(resolve,50));}
    }
    assert.ok(doc?.document_id);
  });
});

test('Windows junction cannot leave the workspace; input limit is enforced on the opened file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ldp-root-test-'));
  const inside=join(dir,'inside'),outside=join(dir,'outside');
  const roots={getClientCapabilities:()=>({roots:{}}),listRoots:async()=>({roots:[{uri:pathToFileURL(inside).href}]})};
  const signal=new AbortController().signal;
  try {
    await mkdir(inside); await mkdir(outside);
    await writeFile(join(outside,'fixture.csv'),'private-marker');
    await symlink(outside,join(inside,'external'),'junction');
    await assert.rejects(projectInput('external/fixture.csv',roots,signal),{code:'ACCESS_DENIED'});
    const data=Buffer.alloc(50*1024*1024);
    await writeFile(join(inside,'edge.csv'),data);
    const opened=await projectInput('edge.csv',roots,signal);
    assert.equal(opened.bytes.length,data.length);
    assert.equal(createHash('sha256').update(opened.bytes).digest('hex'),createHash('sha256').update(data).digest('hex'));
    await writeFile(join(inside,'edge.csv'),'x',{flag:'a'});
    await assert.rejects(projectInput('edge.csv',roots,signal),{code:'RESOURCE_LIMIT'});
  } finally {
    for (const file of [join(inside,'external'),join(inside,'edge.csv'),join(outside,'fixture.csv')]) {
      await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
    for (const folder of [inside,outside,dir]) await rmdir(folder);
  }
});
