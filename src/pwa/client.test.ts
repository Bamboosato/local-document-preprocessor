import {afterEach,beforeEach,expect,it,vi} from 'vitest';
class WorkerFixture extends EventTarget{
  generation='A';complete=true;silent=false;failed=false;state='activated';
  postMessage(message:{type:string},ports:{reply:(data:unknown)=>void}[]){if(!this.silent)queueMicrotask(()=>ports[0].reply({generation:this.generation,complete:this.complete,failed:message.type==='LDP_REPAIR'&&this.failed}));}
}
class Registration extends EventTarget{
  active:WorkerFixture|null=new WorkerFixture();waiting:WorkerFixture|null=null;installing:WorkerFixture|null=null;update=vi.fn(async()=>{});
}
class Container extends EventTarget{
  controller:WorkerFixture|null;register;
  constructor(public registration:Registration){super();this.controller=registration.active;this.register=vi.fn(async()=>registration);}
}
class Channel{
  port1:{onmessage:((event:{data:unknown})=>void)|null;close:()=>void}={onmessage:null,close(){}};
  port2={reply:(data:unknown)=>this.port1.onmessage?.({data})};
}
beforeEach(()=>{vi.resetModules();document.head.innerHTML='<meta name="ldp-generation" content="A">';vi.stubGlobal('MessageChannel',Channel);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();document.head.innerHTML='';});
async function fixture(){const reg=new Registration(),container=new Container(reg);vi.stubGlobal('navigator',{serviceWorker:container});return{reg,container,client:await import('./client')};}
it('PC-01 current controlled complete generation is ready; uncontrolled first load is distinguished',async()=>{
  const {reg,container,client}=await fixture();container.controller=null;await client.startPwa();expect(client.getPwaState()).toEqual({phase:'uncontrolled',canConvert:true});
  container.controller=reg.active;container.dispatchEvent(new Event('controllerchange'));await vi.waitFor(()=>expect(client.getPwaState().phase).toBe('ready'));
});
it('PC-02 wrong generation blocks new conversions without reloading the page',async()=>{
  const {reg,client}=await fixture();reg.active!.generation='other';await client.startPwa();expect(client.getPwaState()).toEqual({phase:'mismatch',canConvert:false});
});
it('PC-03 waiting update preserves old-generation work and does not request takeover',async()=>{
  const {reg,client}=await fixture();reg.waiting=new WorkerFixture();reg.waiting.generation='B';await client.startPwa();expect(client.getPwaState()).toEqual({phase:'waiting',canConvert:true});
});
it('PC-04 legacy/nonresponsive controller cannot be called offline-ready',async()=>{
  vi.useFakeTimers();const {reg,client}=await fixture();reg.active!.silent=true;const start=client.startPwa();await vi.advanceTimersByTimeAsync(2100);await start;expect(client.getPwaState()).toEqual({phase:'error',canConvert:false});
});
it('PC-05 install failure is visible while a healthy old generation remains usable',async()=>{
  const {reg,client}=await fixture();await client.startPwa();const installing=new WorkerFixture();reg.installing=installing;reg.dispatchEvent(new Event('updatefound'));installing.state='redundant';reg.installing=null;installing.dispatchEvent(new Event('statechange'));
  await vi.waitFor(()=>expect(client.getPwaState()).toEqual({phase:'error',canConvert:true}));
});
it('PC-06 failed repair is not success; explicit repair after recovery updates the status',async()=>{
  const {reg,client}=await fixture();reg.active!.complete=false;reg.active!.failed=true;await client.startPwa();expect(client.getPwaState().phase).toBe('degraded');await client.retryPwa();expect(client.getPwaState().phase).toBe('error');
  reg.active!.complete=true;reg.active!.failed=false;await client.retryPwa();expect(client.getPwaState().phase).toBe('ready');expect(reg.update).toHaveBeenCalledTimes(2);
});
it('PC-07 registration rejection can be retried instead of keeping a dead registration',async()=>{
  const {container,client}=await fixture();container.controller=null;container.register.mockRejectedValueOnce(new Error('synthetic'));await client.startPwa();expect(client.getPwaState().phase).toBe('error');await client.retryPwa();expect(client.getPwaState().phase).toBe('uncontrolled');expect(container.register).toHaveBeenCalledTimes(2);
});
it('PC-08 full-asset repair has a separate budget from the short status/legacy handshake',async()=>{
  const {reg,client}=await fixture();await client.startPwa();vi.useFakeTimers();reg.active!.complete=false;
  const worker=reg.active!,post=worker.postMessage.bind(worker);worker.postMessage=(message,ports)=>{if(message.type==='LDP_REPAIR')setTimeout(()=>{worker.complete=true;post(message,ports);},3000);else post(message,ports);};
  const repairing=client.retryPwa();await vi.advanceTimersByTimeAsync(2500);expect(client.getPwaState().phase).toBe('preparing');await vi.advanceTimersByTimeAsync(600);await repairing;expect(client.getPwaState().phase).toBe('ready');
});
