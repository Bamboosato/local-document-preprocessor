import {DISPLAY_LIMIT_BYTES,utf8Bytes,renderStandard} from './standard-renderer.mjs';
import validationURL from './validation-worker.mjs?worker&url';

export function validateGenerated(result,{signal}={}){
  const graph=result?.graph;
  const expected=graph&&'flowchart TD\n'+graph.labels.map((label,i)=>`n${i}@{ shape: rect, labelType: text, label: '${label.replace(/'/g,"''")}' }\n${graph.parents[i]<0?'':`n${graph.parents[i]} --> n${i}\n`}`).join('');
  if(expected!==result?.code||!result.markdown?.endsWith('```mermaid\n'+result.code+'```\n'))return Promise.resolve(false);
  return new Promise(resolve=>{
    let worker,timer;
    const abort=()=>finish(false);
    const finish=value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();resolve(value);};
    if(signal?.aborted){finish(false);return;}
    signal?.addEventListener('abort',abort,{once:true});
    try{worker=new Worker(validationURL);timer=setTimeout(()=>finish(false),15000);worker.onmessage=({data})=>finish(data.nonce==='standard'&&data.valid===true);worker.onerror=e=>{e.preventDefault();finish(false);};worker.postMessage({nonce:'standard',code:result.code});}
    catch{finish(false);}
  });
}
export function createStandardView(root,{validate=validateGenerated,render=renderStandard,delay=300}={}){
  const get=id=>root.querySelector('#'+id),diagram=get('standard-diagram'),source=get('standard-source'),status=get('standard-status'),retry=get('standard-retry');
  const diagramButton=get('standard-show-diagram'),sourceButton=get('standard-show-source');
  let revision=0,timer,validation,disposed=false,mode='diagram',current,state={status:'empty',outputAllowed:false},pendingResolve;
  const messages={empty:'図はありません',validating:'出力内容を検証中',loading:'図を表示中',rendered:'図を表示しました',error:'図を表示できませんでした。Mermaidソースを利用できます。',large:'図が50 KiBを超えるため自動描画しません。Mermaidソースを利用できます。',invalid:'出力を検証できませんでした。再変換してください。'};
  function sync(){
    status.textContent=messages[state.status];status.setAttribute('role',['error','invalid'].includes(state.status)?'alert':'status');
    diagram.hidden=mode!=='diagram';source.hidden=mode!=='source';
    source.value=state.outputAllowed?current.code:'';
    diagramButton.disabled=sourceButton.disabled=!state.outputAllowed;
    diagramButton.setAttribute('aria-pressed',String(mode==='diagram'));sourceButton.setAttribute('aria-pressed',String(mode==='source'));
    retry.hidden=state.status!=='error';
  }
  function cancelPending(){clearTimeout(timer);validation?.abort();validation=undefined;pendingResolve?.(false);pendingResolve=undefined;}
  function clear(){cancelPending();revision++;current=undefined;diagram.replaceChildren();state={status:'empty',outputAllowed:false};mode='diagram';sync();}
  async function paint(id){
    if(id!==revision||disposed)return false;
    state={status:'loading',outputAllowed:true};sync();
    try{
      const svg=await render(current.code);
      if(id!==revision||disposed)return false;
      // Renderer already sanitizes; sanitize occurs before any SVG reaches this sink.
      diagram.innerHTML=svg;state={status:'rendered',outputAllowed:true};sync();return true;
    }catch{
      if(id!==revision||disposed)return false;
      diagram.replaceChildren();state={status:'error',outputAllowed:true};mode='source';sync();return false;
    }
  }
  async function show(result){
    if(disposed)return false;
    clear();const id=revision;state={status:'validating',outputAllowed:false};sync();
    let snapshot;try{snapshot=structuredClone(result);}catch{state={status:'invalid',outputAllowed:false};sync();return false;}
    validation=new AbortController();
    let valid=false;try{valid=await validate(snapshot,{signal:validation.signal});}catch{}
    if(id!==revision||disposed)return false;
    if(!valid){state={status:'invalid',outputAllowed:false};sync();return false;}
    current={code:snapshot.code,markdown:snapshot.markdown};
    if(utf8Bytes(current.code)>DISPLAY_LIMIT_BYTES){state={status:'large',outputAllowed:true};mode='source';sync();return true;}
    state={status:'loading',outputAllowed:true};sync();
    return new Promise(resolve=>{pendingResolve=resolve;timer=setTimeout(async()=>{pendingResolve=undefined;resolve(await paint(id));},delay);});
  }
  diagramButton.onclick=()=>{mode='diagram';sync();};sourceButton.onclick=()=>{mode='source';sync();};
  retry.onclick=()=>{if(state.status==='error')paint(++revision);};sync();
  return {show,clear,state:()=>({...state,mode}),source:()=>state.outputAllowed?current.code:undefined,output:()=>state.outputAllowed?current.markdown:undefined,dispose:()=>{clear();disposed=true;diagramButton.onclick=sourceButton.onclick=retry.onclick=null;}};
}
