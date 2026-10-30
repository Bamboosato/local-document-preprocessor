import {it,expect,vi} from 'vitest';
import {JsonWorkerClient} from './JsonWorkerClient';
class FakeWorker {
  onmessage:((e:{data:unknown})=>void)|null=null;onerror:((e:unknown)=>void)|null=null;
  sent:Record<string,unknown>[]=[];terminated=false;
  postMessage(value:Record<string,unknown>){this.sent.push(value);}terminate(){this.terminated=true;}
  reply(payload:unknown,operation?:string){const r=this.sent.at(-1)!;this.onmessage?.({data:{id:r.id,operation:operation??r.operation,payload}});}
}
const file=()=>({name:'same.json',arrayBuffer:async()=>new TextEncoder().encode('{}').buffer} as File);
it('JC-02 ignores stale Worker responses and operation mismatches; cancellation rejects pending work',async()=>{
  const workers:FakeWorker[]=[];const c=new JsonWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;});
  const old=c.inspect(file()).catch(e=>e.name);await Promise.resolve();c.cancel();expect(await old).toBe('AbortError');
  const next=c.inspect(file());await Promise.resolve();workers[0].reply({old:true});workers[1].reply({bad:true},'convert');
  workers[1].reply({selectionKind:'document',supportsSelection:true,sheets:[],json:true});expect((await next).json).toBe(true);expect(workers[0].terminated).toBe(true);c.dispose();
});
it('JC-02 abort during File reading never creates or posts to a Worker',async()=>{
  let release!:(value:ArrayBuffer)=>void;const factory=vi.fn();const c=new JsonWorkerClient(factory);const abort=new AbortController();
  const slow={name:'a.json',arrayBuffer:()=>new Promise<ArrayBuffer>(r=>release=r)} as File;
  const task=c.inspect(slow,abort.signal).catch(e=>e.name);abort.abort();release(new ArrayBuffer(0));expect(await task).toBe('AbortError');expect(factory).not.toHaveBeenCalled();
});
it('JC-02 unknown request IDs cannot resolve another file and disposal rejects unfinished work',async()=>{
  const w=new FakeWorker();const c=new JsonWorkerClient(()=>w as unknown as Worker);const pending=c.inspect(file()).catch(e=>e.name);await Promise.resolve();w.onmessage?.({data:{id:'unknown',operation:'inspect',payload:{json:true}}});c.dispose();expect(await pending).toBe('AbortError');
});
it('JC-02 incomplete convert payload cannot become a successful exportable result',async()=>{
  const w=new FakeWorker(),c=new JsonWorkerClient(()=>w as unknown as Worker);
  const pending=c.convert(file(),{pointer:'',style:'items'}).catch(e=>e.code);await Promise.resolve();w.reply({markdown:'incomplete'});expect(await pending).toBe('conversionFailed');c.dispose();
});
