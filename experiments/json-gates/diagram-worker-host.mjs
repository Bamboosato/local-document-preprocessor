import validationURL from './validation-worker.mjs?worker&url';
import layoutURL from './layout-worker.mjs?worker&url';
import {startDeadline} from './deadline.mjs';
const NS='http://www.w3.org/2000/svg';
export function createWorkerDiagramController(container,{workerLoader,onStateChange=()=>{}}={}){
  let validator,worker,deadline,pendingValidation,generation=0,source,mode={},state={status:'idle',validated:false,outputAllowed:false};
  const trace=[];
  const blobURLs=new Set();
  async function supportsBlobWorker(){
    const url=URL.createObjectURL(new Blob(['self.postMessage(true)'],{type:'text/javascript'}));
    let probe;
    try{return await new Promise(resolve=>{const timeout=setTimeout(()=>resolve(false),1000);probe=new Worker(url);probe.onmessage=()=>{clearTimeout(timeout);resolve(true);};probe.onerror=event=>{event.preventDefault();clearTimeout(timeout);resolve(false);};});}
    catch{return false;}
    finally{probe?.terminate();URL.revokeObjectURL(url);}
  }
  const loadWorker=workerLoader??(async(url,current)=>{
    state.staticStage='cache-lookup';
    const absolute=new URL(url,location.href).href;
    const cached=globalThis.caches?await (await caches.open('json-g04-alternative-static-v1')).match(absolute):undefined;
    if(current===generation)state.staticStage=cached?'cache-hit':'network-fetch';
    const response=cached??await fetch(absolute);if(!response.ok)throw new Error('static-asset');
    // Only a build-produced, same-origin, self-contained STATIC script enters
    // this volatile URL. Document data is sent exclusively through postMessage.
    // data URLs avoid WebKit's offline Blob-Worker failure (minimal probe kept).
    const code=await response.text();
    const blobSupported=await supportsBlobWorker();
    if(current!==generation)return;
    let scriptURL;
    if(blobSupported){scriptURL=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));blobURLs.add(scriptURL);}
    else scriptURL='data:text/javascript;charset=utf-8,'+encodeURIComponent(code);
    state.workerScheme=blobSupported?'blob':'data';
    state.staticStage='worker-create';
    return new Worker(scriptURL);
  });
  const record=(status,extra={})=>{state={...state,status,...extra};trace.push({status,generation,at:performance.now()});onStateChange({...state});};
  const destroy=()=>{deadline?.cancel();deadline=undefined;validator?.terminate();worker?.terminate();validator=worker=undefined;for(const url of blobURLs)URL.revokeObjectURL(url);blobURLs.clear();};
  const clear=()=>{destroy();pendingValidation?.(false);pendingValidation=undefined;generation++;source=undefined;container.replaceChildren();state={status:'idle',validated:false,outputAllowed:false};record('cleared');};
  const fallback=(status,reason)=>{destroy();generation++;container.textContent='図を表示できませんでした。Mermaidソースを表示します。\n'+(state.validated?source.code:'');record(status,{workerAlive:false,failureReason:reason});};
  const element=(name,attributes={},text)=>{const el=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attributes))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
  async function render(){
    destroy();container.replaceChildren();const current=++generation,start=performance.now();record('initializing',{renderCount:(state.renderCount??0)+1,workerAlive:true});
    deadline=startDeadline(15000,elapsed=>{if(current===generation){fallback('initialization-timeout');record('initialization-timeout',{elapsed});}});
    try{const loaded=await loadWorker(layoutURL,current);if(current!==generation){loaded?.terminate();return;}worker=loaded;}catch{if(current===generation)fallback('display-failed','asset-load');return;}
    worker.onerror=event=>{event.preventDefault();if(current===generation)fallback('display-failed','worker-error');};
    worker.onmessage=async({data})=>{
      if(current!==generation)return;
      if(deadline?.check()||current!==generation)return;
      if(data.kind==='ready'){
        deadline?.cancel();record('rendering',{started:performance.now(),initializationMilliseconds:performance.now()-start});
        deadline=startDeadline(5000,elapsed=>{if(current!==generation)return;fallback('render-timeout');record('render-timeout',{elapsed});});
        worker.postMessage({generation:current,graph:source.graph,...mode});return;
      }
      if(data.generation!==current)return;
      if(data.kind!=='layout'){fallback('display-failed');return;}
      try{
        if(data.nodes.length!==source.graph.labels.length||data.edges.length!==data.nodes.length-1||![data.width,data.height].every(n=>Number.isFinite(n)&&n>0&&n<=75000))throw 0;
        const svg=element('svg',{width:data.width,height:data.height,viewBox:`0 0 ${data.width} ${data.height}`,role:'img','aria-label':'JSONの構造'});
        for(const [from,to]of data.edges){
          if(source.graph.parents[to]!==from)throw 0;
          const a=data.nodes[from],b=data.nodes[to];svg.append(element('path',{d:`M ${a.x+340} ${a.y+125} H ${b.x-15} V ${b.y+125} H ${b.x}`,fill:'none',stroke:'#555','data-edge':`${from}:${to}`}));
        }
        for(let i=0;i<data.nodes.length;i++){
          const n=data.nodes[i];if(n.label!==source.graph.labels[i]||n.lines.join('')!==n.label||![n.x,n.y].every(v=>Number.isFinite(v)&&v>=0&&v<=75000))throw 0;
          const g=element('g',{'data-node':i});g.append(element('rect',{x:n.x,y:n.y,width:340,height:250,fill:'white',stroke:'#555'}));
          // Full literal label is accessible; visible lines contain exactly the same codepoints.
          g.append(element('title',{},n.label));
          const text=element('text',{x:n.x+10,y:n.y+22,'font-size':16,'font-family':'monospace',fill:'#111','data-label':i});
          for(const line of n.lines)text.append(element('tspan',{x:n.x+10,dy:text.childNodes.length?22:0},line));g.append(text);svg.append(g);
          // Yield bounded batches; clear/timeouts can discard partial detached SVG.
          if(i%10===9){await new Promise(resolve=>setTimeout(resolve,0));if(deadline?.check()||current!==generation||state.status!=='rendering')return;}
        }
        if(deadline?.check()||current!==generation||state.status!=='rendering')return;
        container.replaceChildren(svg);const elapsed=performance.now()-state.started;destroy();record('rendered',{elapsed,workerAlive:false,details:{nodeCount:data.nodes.length,edgeCount:data.edges.length}});
      }catch {if(current===generation)fallback('display-failed');}
    };
  }
  function show(result,options={}){
    clear();source=structuredClone(result);mode={...options};const current=++generation;record('validating');
    return new Promise(async resolve=>{
      pendingValidation=resolve;
      const fail=()=>{if(current!==generation){resolve(false);return;}destroy();generation++;pendingValidation=undefined;record('validation-failed',{validated:false,outputAllowed:false});resolve(false);};
      deadline=startDeadline(15000,fail);
      try{const loaded=await loadWorker(validationURL,current);if(current!==generation){loaded?.terminate();resolve(false);return;}validator=loaded;}catch{fail();return;}
      validator.onerror=event=>{event.preventDefault();fail();};
      validator.onmessage=({data})=>{
        if(current!==generation){resolve(false);return;}
        if(deadline?.check()||current!==generation){resolve(false);return;}
        // Bind the layout input to the exact validated Mermaid source.
        let expected;
        try{expected='flowchart TD\n'+source.graph.labels.map((label,i)=>`n${i}@{ shape: rect, labelType: text, label: '${label.replace(/'/g,"''")}' }\n${source.graph.parents[i]<0?'':`n${source.graph.parents[i]} --> n${i}\n`}`).join('');}catch{fail();return;}
        if(!data.valid||expected!==source.code){fail();return;}
        destroy();pendingValidation=undefined;record('validated',{validated:true,outputAllowed:true});render();resolve(true);
      };
      validator.postMessage({nonce:String(current),code:source.code});
    });
  }
  return {show,clear,retry:()=>{if(!state.validated)return false;render();return true;},setMode:options=>{mode=options;},state:()=>({...state,trace:trace.slice(-40)})};
}
