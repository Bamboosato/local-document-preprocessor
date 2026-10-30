import {it,expect,vi} from 'vitest';
import {JsonWorkerClient as ProductionClient,readJsonFile} from './JsonWorkerClient';
import {initialJsonView} from './contracts';
import {targetPage} from './targetUi';
import {parseText} from './core.mjs';
// The mock reader can deliberately remain unresolved to prove FIFO behavior.
class JsonWorkerClient extends ProductionClient {
  constructor(factory:()=>Worker){super(factory,(file)=>file.arrayBuffer());}
}
class FakeWorker {
  onmessage:((e:{data:unknown})=>void)|null=null;onerror:((e:{preventDefault:()=>void})=>void)|null=null;
  sent:Record<string,unknown>[]=[];terminated=false;autoRelease=true;
  postMessage(value:Record<string,unknown>){this.sent.push(value);if(value.operation==='release'&&this.autoRelease)queueMicrotask(()=>this.reply({released:true},undefined,value));}
  terminate(){this.terminated=true;}
  reply(payload:unknown,operation?:string,request=this.sent.at(-1)!,overrides={}){this.onmessage?.({data:{...request,buffer:undefined,operation:operation??request.operation,payload,...overrides}});}
}
const file=()=>({name:'same.json',arrayBuffer:vi.fn(async()=>new TextEncoder().encode('{}').buffer)} as unknown as File);
const inspection={selectionKind:'document',supportsSelection:true,sheets:[],json:true,jsonInitialValid:true};
const posted=async(w:FakeWorker,index=0)=>{await vi.waitFor(()=>expect(w.sent.length).toBeGreaterThan(index));};
const page=()=>targetPage(parseText('{"b":{}}'),{pointer:'/b',style:'items'},initialJsonView());

it('JC-02 ignores stale Worker responses and operation mismatches; cancellation rejects pending work',async()=>{
  const workers:FakeWorker[]=[];const c=new JsonWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;});
  const old=c.inspect(file()).catch(e=>e.name);await vi.waitFor(()=>expect(workers).toHaveLength(1));c.cancel();expect(await old).toBe('AbortError');
  const next=c.inspect(file());await vi.waitFor(()=>expect(workers).toHaveLength(2));workers[0].reply({old:true});workers[1].reply({bad:true},'convert');
  workers[1].reply(inspection);expect((await next).json).toBe(true);expect(workers[0].terminated).toBe(true);c.dispose();
});
it('JC-02 abort during File reading rejects immediately and never posts the old buffer',async()=>{
  let release!:(value:ArrayBuffer)=>void;const factory=vi.fn();const c=new JsonWorkerClient(factory);const abort=new AbortController();
  const slow={name:'a.json',arrayBuffer:()=>new Promise<ArrayBuffer>(r=>release=r)} as File;
  const task=c.inspect(slow,abort.signal).catch(e=>e.name);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  abort.abort();expect(await task).toBe('AbortError');release(new ArrayBuffer(0));await Promise.resolve();expect(factory).not.toHaveBeenCalled();c.dispose();
});
it('JC-02 unknown request IDs cannot resolve another file and disposal rejects unfinished work',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker);const task=c.inspect(file()).catch(e=>e.name);await posted(w);
  w.onmessage?.({data:{id:'unknown',operation:'inspect',payload:inspection}});c.dispose();expect(await task).toBe('AbortError');
});
it('JC-02 incomplete convert payload cannot become exportable',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker);const task=c.convert(file(),{pointer:'',style:'items'}).catch(e=>e.code);await posted(w);
  w.reply({markdown:'incomplete'});expect(await task).toBe('conversionFailed');c.dispose();
});
it('TU-11 aborted in-flight target terminates its generation; late replies cannot replace the new target',async()=>{
  const workers:FakeWorker[]=[],c=new JsonWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;}),controller=new AbortController();
  const first=c.target(file(),{pointer:'',style:'items'},initialJsonView(),false,controller.signal).catch(e=>e.name);
  await vi.waitFor(()=>expect(workers).toHaveLength(1));controller.abort();expect(await first).toBe('AbortError');expect(workers[0].terminated).toBe(true);
  const next=c.target(file(),{pointer:'/b',style:'items'},initialJsonView());await vi.waitFor(()=>expect(workers).toHaveLength(2));
  workers[0].reply(page());workers[1].reply(page());expect((await next).pointer).toBe('/b');c.dispose();
});
it('TU-12 malformed target response cannot enable confirmation',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker);const task=c.target(file(),{pointer:'',style:'items'},initialJsonView()).catch(e=>e.code);await posted(w);
  w.reply({pointer:'',rows:[],styles:[]});expect(await task).toBe('conversionFailed');c.dispose();
});
it('SR-01 identical File reuses its parsed bytes; a different File with the same name waits for release before reading',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker),a=file(),b=file();w.autoRelease=false;
  const completed=new AbortController(),first=c.inspect(a,completed.signal);await posted(w);w.reply(inspection);await first;completed.abort();expect(w.terminated).toBe(false);
  const same=c.inspect(a);await posted(w,1);expect(w.sent[1].buffer).toBeUndefined();w.reply(inspection);await same;
  expect(a.arrayBuffer).toHaveBeenCalledTimes(1);
  const other=c.inspect(b);await posted(w,2);expect(w.sent[2].operation).toBe('release');expect(b.arrayBuffer).not.toHaveBeenCalled();
  w.reply({released:true});await posted(w,3);expect(w.sent[3].fileId).not.toBe(w.sent[0].fileId);expect((w.sent[3].buffer as ArrayBuffer).byteLength).toBe(2);
  w.reply(inspection);await other;c.dispose();
});
it('SR-02 cancelled File read does not allow a second full input read to start until it settles',async()=>{
  let release!:(value:ArrayBuffer)=>void;const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker),controller=new AbortController(),b=file();
  const a={name:'a.json',arrayBuffer:()=>new Promise<ArrayBuffer>(r=>release=r)} as File;
  const first=c.inspect(a,controller.signal).catch(e=>e.name);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));controller.abort();expect(await first).toBe('AbortError');
  const next=c.inspect(b);await Promise.resolve();expect(b.arrayBuffer).not.toHaveBeenCalled();release(new ArrayBuffer(0));await posted(w);w.reply(inspection);await next;expect(b.arrayBuffer).toHaveBeenCalledTimes(1);c.dispose();
});
it('SR-03 mismatched file/settings envelopes are rejected; subsequent recovery reads the input again',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker),a=file();
  const first=c.inspect(a).catch(e=>e.code);await posted(w);w.reply(inspection,undefined,undefined,{fileId:'other'});expect(await first).toBe('conversionFailed');
  const next=c.inspect(a).catch(e=>e.code);await posted(w,1);w.reply(inspection,undefined,undefined,{settings:{pointer:'/old',style:'items'}});expect(await next).toBe('conversionFailed');
  const oldParse=c.inspect(a).catch(e=>e.code);await posted(w,2);w.reply(inspection,undefined,undefined,{parseGeneration:-1});expect(await oldParse).toBe('conversionFailed');
  const good=c.inspect(a);await posted(w,3);w.reply(inspection);await good;expect(a.arrayBuffer).toHaveBeenCalledTimes(4);c.dispose();
});
it('SR-04 Worker error recreates the Worker and requires reparsing without poisoning future requests',async()=>{
  const workers:FakeWorker[]=[],c=new JsonWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;}),a=file();
  const first=c.inspect(a).catch(e=>e.code);await vi.waitFor(()=>expect(workers).toHaveLength(1));workers[0].onerror?.({preventDefault(){}});expect(await first).toBe('conversionFailed');
  const next=c.inspect(a);await vi.waitFor(()=>expect(workers).toHaveLength(2));workers[0].onerror?.({preventDefault(){}});workers[1].reply(inspection);await next;expect(a.arrayBuffer).toHaveBeenCalledTimes(2);expect(workers).toHaveLength(2);c.dispose();
});
it('SR-05 settings are snapshotted before asynchronous reading, and oversized files are rejected before reading',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker),settings={pointer:'/b',style:'items' as const};
  const first=c.target(file(),settings,initialJsonView());settings.pointer='/old';await posted(w);expect(w.sent[0].settings).toEqual({pointer:'/b',style:'items'});w.reply(page());await first;
  const huge={...file(),size:50*1024**2+1} as File;expect(await c.inspect(huge).catch(e=>e.code)).toBe('resourceLimit');expect(huge.arrayBuffer).not.toHaveBeenCalled();c.dispose();
});
it('SR-06 queued cancellation and failed File read do not block later valid requests',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker),controller=new AbortController(),queued=file();
  const first=c.inspect(file());await posted(w);const cancelled=c.inspect(queued,controller.signal).catch(e=>e.name);controller.abort();expect(await cancelled).toBe('AbortError');w.reply(inspection);await first;
  const bad={name:'bad.json',arrayBuffer:async()=>{throw new Error('synthetic-read');}} as unknown as File;
  const failed=c.inspect(bad).catch(e=>e.message);await posted(w,1);expect(await failed).toBe('synthetic-read');expect(queued.arrayBuffer).not.toHaveBeenCalled();
  const good=c.inspect(file());await posted(w,2);w.reply(inspection);await good;c.dispose();
});
it('SR-15 a postMessage failure discards the Worker and the next request reparses successfully',async()=>{
  const broken=new FakeWorker(),good=new FakeWorker();broken.postMessage=()=>{throw new Error('synthetic-post');};let count=0;
  const c=new JsonWorkerClient(()=>(++count===1?broken:good) as unknown as Worker),a=file();
  expect(await c.inspect(a).catch(e=>e.code)).toBe('initializationFailed');expect(broken.terminated).toBe(true);
  const next=c.inspect(a);await posted(good);good.reply(inspection);await next;expect(a.arrayBuffer).toHaveBeenCalledTimes(2);c.dispose();
});
it('SR-16 the existing 30-second Worker deadline rejects and recovers without leaking a pending request',async()=>{
  vi.useFakeTimers();const workers:FakeWorker[]=[],c=new JsonWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;});
  try{
    const timed=c.inspect(file()).catch(e=>e.code);await vi.advanceTimersByTimeAsync(0);expect(workers[0].sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30001);expect(await timed).toBe('resourceLimit');expect(workers[0].terminated).toBe(true);
    const next=c.inspect(file());await vi.advanceTimersByTimeAsync(0);workers[1].reply(inspection);await next;
  }finally{c.dispose();vi.useRealTimers();}
});
it('SR-17 native FileReader preserves bytes and acknowledges cancellation',async()=>{
  const file=new File(['{"n":-0}'],'reader.json');
  const buffer=await readJsonFile(file,new AbortController().signal);expect(new TextDecoder().decode(buffer)).toBe('{"n":-0}');
  const controller=new AbortController(),cancelled=readJsonFile(file,controller.signal).catch(error=>error.name);controller.abort();expect(await cancelled).toBe('AbortError');
});
it('SR-18 the native reader deadline aborts stalled I/O and releases its handlers',async()=>{
  vi.useFakeTimers();let aborted=false;
  class StalledReader {
    onload:(()=>void)|null=null;onerror:(()=>void)|null=null;onabort:(()=>void)|null=null;
    readAsArrayBuffer(){} abort(){aborted=true;this.onabort?.();}
  }
  vi.stubGlobal('FileReader',StalledReader);
  try{
    const task=readJsonFile(file(),new AbortController().signal).catch(error=>error.code);await vi.advanceTimersByTimeAsync(30001);expect(await task).toBe('resourceLimit');expect(aborted).toBe(true);
  }finally{vi.unstubAllGlobals();vi.useRealTimers();}
});
