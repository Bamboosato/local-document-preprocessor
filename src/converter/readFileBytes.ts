// Use abortable I/O so replacing a selection cannot leave a full old input
// reading while the next file begins. Both converter clients share this path.
export function readFileBytes(file:File,signal:AbortSignal,error:(code:'resourceLimit'|'conversionFailed')=>Error):Promise<ArrayBuffer>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    const reader=new FileReader();let timedOut=false;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reader.onload=reader.onerror=reader.onabort=null;};
    const fail=(reason:unknown)=>{cleanup();reject(reason);};
    const abort=()=>reader.abort();
    const timer=setTimeout(()=>{timedOut=true;reader.abort();fail(error('resourceLimit'));},30000);
    reader.onload=()=>{const buffer=reader.result;cleanup();if(buffer instanceof ArrayBuffer)resolve(buffer);else reject(error('conversionFailed'));};
    reader.onerror=()=>fail(error('conversionFailed'));
    reader.onabort=()=>fail(timedOut?error('resourceLimit'):new DOMException('Cancelled','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    try{reader.readAsArrayBuffer(file);}catch{fail(error('conversionFailed'));}
  });
}
