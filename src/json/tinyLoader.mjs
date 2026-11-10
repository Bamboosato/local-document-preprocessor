import tinyUrl from '@mermaid-js/tiny/dist/mermaid.tiny.js?url';

let loading;
// The published IIFE needs classic-script scope; module evaluation changes its globals.
// Each realm (page or JSON worker) initializes its own instance from the same asset URL.
export function loadTiny(){
  if(!loading)loading=new Promise((resolve,reject)=>{
    const finish=()=>{
      const mermaid=globalThis.mermaid;
      if(!mermaid||typeof mermaid.initialize!=='function'||typeof mermaid.parse!=='function'||typeof mermaid.render!=='function')throw Error('tiny-api');
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',htmlLabels:false,flowchart:{htmlLabels:false},suppressErrorRendering:true,maxTextSize:100000});
      resolve(mermaid);
    };
    if(typeof document==='undefined'){
      try{globalThis.importScripts(tinyUrl);finish();}catch(error){reject(error);}
      return;
    }
    const script=document.createElement('script');let timer;
    const cleanup=()=>{clearTimeout(timer);script.onload=null;script.onerror=null;script.remove();};
    script.src=tinyUrl;script.async=true;
    script.onload=()=>{cleanup();try{finish();}catch(error){reject(error);}};
    script.onerror=()=>{cleanup();reject(Error('tiny-load'));};
    timer=setTimeout(()=>{cleanup();reject(Error('tiny-load-timeout'));},15000);
    document.head.append(script);
  }).catch(error=>{loading=undefined;throw error;});
  return loading;
}
