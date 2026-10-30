export type PwaPhase='online'|'preparing'|'ready'|'uncontrolled'|'waiting'|'error'|'degraded'|'mismatch';
export interface PwaState {phase:PwaPhase;canConvert:boolean}
let state:PwaState={phase:'online',canConvert:typeof navigator==='undefined'||!('serviceWorker'in navigator)||!navigator.serviceWorker.controller};
const listeners=new Set<()=>void>();
export const getPwaState=()=>state;
export const subscribePwa=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const emit=(value:PwaState)=>{if(state.phase===value.phase&&state.canConvert===value.canConvert)return;state=value;for(const listener of listeners)listener();};
let registration:ServiceWorkerRegistration|undefined,revision=0,updateFailed=false;
const pageGeneration=()=>document.querySelector<HTMLMetaElement>('meta[name=ldp-generation]')?.content;
function ask(worker:ServiceWorker,type='LDP_STATUS'):Promise<{generation:string;complete:boolean;failed?:boolean}>{
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('worker-status-unavailable'));},type==='LDP_REPAIR'?120000:2000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();const value=event.data;if(typeof value?.generation==='string'&&typeof value.complete==='boolean')resolve(value);else reject(new Error('invalid-worker-status'));};
    try{worker.postMessage({type},[channel.port2]);}catch(error){clearTimeout(timer);channel.port1.close();reject(error);}
  });
}
async function check(){
  const reg=registration;if(!reg)return;const token=++revision,active=reg.active;
  if(!active){emit({phase:reg.installing?'preparing':'error',canConvert:!navigator.serviceWorker.controller});return;}
  try{
    const reply=await ask(active);if(token!==revision||registration!==reg||reg.active!==active)return;
    const matches=reply.generation===pageGeneration();
    emit({phase:reg.waiting?'waiting':!matches?'mismatch':reg.installing?'preparing':updateFailed?'error':!reply.complete?'degraded':navigator.serviceWorker.controller?'ready':'uncontrolled',canConvert:matches});
  }catch{if(token===revision)emit({phase:reg.waiting?'waiting':'error',canConvert:!navigator.serviceWorker.controller});}
}
export async function retryPwa(){
  const reg=registration;if(!reg?.active){started=false;registration=undefined;await startPwa();return;}
  updateFailed=false;
  emit({...state,phase:'preparing'});
  try{await reg.update();if(reg.active){const reply=await ask(reg.active,'LDP_REPAIR');if(reply.failed)updateFailed=true;}await check();}
  catch{updateFailed=true;await check();}
}
let started=false;
export async function startPwa(){
  if(!('serviceWorker'in navigator)||!pageGeneration())return;
  if(started){await check();return;}started=true;
  emit({phase:'preparing',canConvert:!navigator.serviceWorker.controller});
  const watch=(reg:ServiceWorkerRegistration)=>{
    const installing=reg.installing;if(!installing)return;
    installing.addEventListener('statechange',()=>{if(installing.state==='redundant')updateFailed=true;if(['installed','activated'].includes(installing.state))updateFailed=false;if(['installed','activated','redundant'].includes(installing.state))void check();});
  };
  try{
    registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
    const reg=registration;watch(reg);reg.addEventListener('updatefound',()=>{watch(reg);});
    navigator.serviceWorker.addEventListener('controllerchange',()=>void check());
    navigator.serviceWorker.addEventListener('message',event=>{if(state.phase!=='waiting'&&event.source===navigator.serviceWorker.controller&&event.data?.type==='LDP_CACHE_DEGRADED')emit({...state,phase:'degraded'});});
    await check();
  }catch{started=false;emit({phase:'error',canConvert:!navigator.serviceWorker.controller});}
}
