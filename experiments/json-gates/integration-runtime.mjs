import './readiness.css';
import conversionURL from './integration-conversion.worker.mjs?worker&url';
import {createDiagramView} from './diagram-view.mjs';
import {processSequentially} from '../../src/conversion/processQueue.ts';
import {markdownToPlainText} from '../../src/plainText/markdownToPlainText.ts';
import {markdownDownloadContent,outputFileName} from '../../src/utils/files.ts';

const staticWorker=url=>{
  const absolute=new URL(url,location.href);
  if(absolute.origin!==location.origin||absolute.search||!/^\/assets\/[^/]+\.js$/.test(absolute.pathname))throw new Error('static-worker-only');
  return new Worker(absolute);
};
const view=createDiagramView(document.querySelector('#diagram-view'),{workerLoader:async url=>staticWorker(url)});
window.readiness=view; // Shared view API for the existing generation-update verifier.
let sequence=0,calls=0;
async function request(operation,payload={}){
  calls++;
  const worker=staticWorker(conversionURL),id=++sequence;
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('request-timeout'));},30000);
    const fail=()=>{clearTimeout(timer);reject(new Error('conversion-failed'));};
    worker.onerror=event=>{event.preventDefault();fail();};
    worker.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);data.error?reject(new Error('conversion-failed')):resolve(data.result);};
    worker.postMessage({id,operation,...payload});
  });}finally{worker.terminate();}
}
window.integration={
  view,calls:()=>calls,
  pdf:bytes=>request('pdf',{bytes}),
  json:text=>request('json',{text}),
  async show(text){const source=await request('json',{text});await view.diagram.show(source);return source;},
  async mixed(bytes){
    const results=[],errors=[],starts=[];
    await processSequentially([{id:1,pdf:true},{id:2,text:'{'},{id:3,text:'{"synthetic":true}'}],
      item=>item.pdf?request('pdf',{bytes}):request('json',{text:item.text}),
      {onStart:item=>starts.push(item.id),onSuccess:(item,result)=>results.push({id:item.id,pdf:result.pdfConverted===true,json:!!result.code}),onError:item=>errors.push(item.id)},new AbortController().signal);
    return {results,errors,starts};
  },
  async cancel(){
    const controller=new AbortController(),completed=[],started=[];let release,entered;
    const waiting=new Promise(resolve=>{entered=resolve;});
    const running=processSequentially([1,2,3],async item=>{if(item===2){entered();await new Promise(resolve=>{release=resolve;});}return item;},
      {onStart:item=>started.push(item),onSuccess:(_item,result)=>completed.push(result),onError:()=>{}},controller.signal);
    await waiting;controller.abort();release();await running;return {completed,started};
  },
  async exports(){
    const result=await request('json',{text:'{"synthetic":"fixed"}'});
    await view.diagram.show(result);
    const plain=markdownToPlainText(result.markdown),download=markdownDownloadContent(result.markdown,'synthetic.json',0);
    const header=result.markdown.slice(0,result.markdown.indexOf('```mermaid\n'));
    const valid=view.diagram.state().outputAllowed;
    await view.diagram.show({...result,code:'invalid'});
    return {valid,plainHasExactSource:plain===markdownToPlainText(header)+'\n\n'+result.code.trimEnd(),bodyHasFrontmatter:result.markdown.startsWith('---\n'),downloadHasFrontmatter:download.startsWith('---\ntitle: "synthetic.json"\noriginalUpdatedAt: "1970-01-01T00:00:00.000Z"\n---\n\n'),deterministic:download===markdownDownloadContent(result.markdown,'synthetic.json',0),safeFileName:outputFileName('../synthetic.json','.md')==='.._synthetic.md',invalidBlocked:!view.diagram.state().outputAllowed&&view.source()===undefined};
  },
};
navigator.serviceWorker.register('/integration-sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{document.querySelector('#cache-status').textContent='静的資産取得済み';}).catch(()=>{document.querySelector('#cache-status').textContent='資産保存失敗（オンラインのみ）';});
