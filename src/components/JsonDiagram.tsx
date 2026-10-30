import {useEffect,useRef,useState} from 'react';
import {DISPLAY_LIMIT_BYTES,utf8Bytes,renderStandard} from '../json/mermaidRenderer.mjs';
export function JsonDiagram({code}:{code:string}){
  const [mode,setMode]=useState<'diagram'|'source'>('diagram'),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<{code:string;retry:number;svg?:string;failed?:boolean}>();
  const revision=useRef(0);const large=utf8Bytes(code)>DISPLAY_LIMIT_BYTES;
  const current=result?.code===code&&result.retry===retry?result:undefined;
  useEffect(()=>{
    const id=++revision.current;
    if(large)return;
    const timer=setTimeout(()=>{void renderStandard(code).then(svg=>{if(revision.current===id)setResult({code,retry,svg});},()=>{if(revision.current===id)setResult({code,retry,failed:true});});},300);
    return()=>{clearTimeout(timer);revision.current++;};
  },[code,retry,large]);
  return <section className="json-diagram" aria-label="JSON構造図">
    <div><button type="button" aria-pressed={mode==='diagram'} onClick={()=>setMode('diagram')}>図</button><button type="button" aria-pressed={mode==='source'} onClick={()=>setMode('source')}>Mermaidソース</button></div>
    {large?<p role="status">図が50 KiBを超えるため自動描画しません。Mermaidソースを利用できます。</p>:current?.failed?<p role="alert">図を表示できませんでした。ソースを利用できます。資産取得の失敗が続く場合は必要な入力・ソースを手元に保存して再読込してください。<button type="button" onClick={()=>setRetry(n=>n+1)}>図を再試行</button></p>:!current?.svg?<p role="status">図を表示中</p>:null}
    {mode==='source'||large||current?.failed?<pre className="json-source">{code}</pre>:current?.svg?<div className="json-svg" tabIndex={0} role="region" aria-label="JSON構造図の表示領域" dangerouslySetInnerHTML={{__html:current.svg}}/>:null}
  </section>;
}
