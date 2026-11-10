import {parseBytes,generate} from '../json-gates/core.mjs';
import {sanitizeStandardSvg} from '../../src/json/mermaidRenderer.mjs';
const tiny=globalThis.mermaid;
tiny.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:100000});
let tail=Promise.resolve(),generation=0,validationTimeout=15000,verified;
const active=new Set(),$=id=>document.getElementById(id);
const version=typeof __POC_VERSION__==='undefined'?'default':__POC_VERSION__;
const withinDisplayLimit=code=>new TextEncoder().encode(code).length<=50*1024;
function validate(code){return new Promise((resolve,reject)=>{
  let worker,timer,done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);active.delete(cancel);worker?.terminate();error?reject(error):resolve();};
  const cancel=()=>finish(Error('cancelled'));active.add(cancel);
  try{
    worker=new Worker('/worker.js');
    timer=setTimeout(()=>finish(Error('verification-timeout')),validationTimeout);
    worker.onmessage=({data})=>finish(data?.loaded===true&&data?.parse===true?undefined:Error('verification'));
    worker.onerror=()=>finish(Error('worker-error'));worker.onmessageerror=()=>finish(Error('worker-message'));
    worker.postMessage(code);
  }catch{finish(Error('worker-start'));}
});}
async function prepare(text,pointer=''){
  const generated=generate(parseBytes(new TextEncoder().encode(text)),pointer,'mermaid','fixture.json');
  await validate(generated.code);return {...generated,displayable:withinDisplayLimit(generated.code)};
}
function begin(){
  generation++;for(const cancel of [...active])cancel();verified=undefined;
  $('result').replaceChildren();$('source-code').textContent='';$('copy').disabled=$('save').disabled=true;
  $('status').textContent='';return generation;
}
function draw(code,current){
  const task=tail.then(async()=>{
    if(current!==generation)return 'stale';
    const {svg}=await tiny.render('poc'+current,code);
    if(current!==generation)return 'stale';
    $('result').innerHTML=sanitizeStandardSvg(svg);return code;
  });tail=task.catch(()=>{});return task;
}
window.poc={
  version,withinDisplayLimit,prepare,sanitize:sanitizeStandardSvg,
  graph(text,pointer=''){return generate(parseBytes(new TextEncoder().encode(text)),pointer,'mermaid','fixture.json').graph;},
  clear:begin,
  testing:{setValidationTimeout(ms){if(!Number.isFinite(ms)||ms<50||ms>15000)throw Error('test-timeout');validationTimeout=ms;},activeWorkers:()=>active.size},
  async render(text,pointer=''){
    const current=begin();
    try{const prepared=await prepare(text,pointer);if(current!==generation)return 'stale';if(!prepared.displayable)throw Error('display-limit');return await draw(prepared.code,current);}
    catch(error){if(current!==generation)return 'stale';throw error;}
  }
};
for(const id of ['json-input','pointer'])$(id).addEventListener('input',begin);
$('clear').onclick=()=>{begin();$('json-input').value='';$('pointer').value='';};
$('cancel').onclick=()=>{begin();$('status').textContent='取消済み';};
$('source').onclick=()=>{$('source-code').hidden=false;$('result').hidden=true;};
$('diagram').onclick=()=>{$('source-code').hidden=true;$('result').hidden=false;};
$('convert').onclick=async()=>{
  const current=begin();$('status').textContent='検証中';
  try{
    const prepared=await prepare($('json-input').value,$('pointer').value);
    if(current!==generation)return;
    verified=prepared;$('source-code').textContent=prepared.code;$('copy').disabled=$('save').disabled=false;
    if(!prepared.displayable){$('status').textContent='50 KiBを超えるため図を表示できません。検証済みソースは保存できます。';return;}
    $('status').textContent='描画中';await draw(prepared.code,current);
    if(current===generation)$('status').textContent='完了';
  }catch(error){if(current===generation)$('status').textContent='処理失敗: '+error.message;}
};
$('copy').onclick=async()=>{
  if(!verified)return;const requested=verified;
  try{await navigator.clipboard.writeText(requested.code);if(verified===requested)$('status').textContent='コピーしました';}
  catch{if(verified===requested)$('status').textContent='コピーできませんでした';}
};
$('save').onclick=()=>{
  if(!verified)return;
  const url=URL.createObjectURL(new Blob([verified.markdown],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='fixture.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
