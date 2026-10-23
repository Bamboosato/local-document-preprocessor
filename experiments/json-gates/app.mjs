import './style.css';
import { createDiagramController } from './diagram-host.mjs';
import { createWorkerDiagramController } from './diagram-worker-host.mjs';
const $=selector=>document.querySelector(selector);
const files=new Map(),business=new Map(),views=new Map();
let epoch=0,worker,id=0,pending=new Map(),current='A',draft={pointer:'',style:'items'},selectionRequest=0,treeRequest=0,stats={},cancelled=0;
let fileQueue=Promise.resolve();
function resetWorker() {
  worker?.terminate();epoch++;
  for(const state of business.values())if(state.status==='converting')state.status='cancelled';
  for(const p of pending.values())p.reject(new Error('cancelled'));pending.clear();
  worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
    const q=event.data,p=pending.get(q.id);
    if(q.epoch!==epoch || !p)return;
    if(q.busy || q.pdfStarted){p.started?.(q);return;}
    pending.delete(q.id);stats=q.stats??stats;
    if(q.error)p.reject(Object.assign(new Error(q.error),{code:q.error}));else p.resolve(q.result);
  };
  worker.onerror=event=>{event.preventDefault();cancelled++;resetWorker();};
  fileQueue=Promise.resolve();
}
resetWorker();
async function raw(fileId,operation,extra={},started) {
  const requestEpoch=epoch,requestId=++id;
  const buffer=files.has(fileId)?await files.get(fileId).arrayBuffer():new ArrayBuffer(0);
  if(requestEpoch!==epoch)throw new Error('cancelled');
  if(operation==='pdf')business.get(fileId).status='converting';
  return new Promise((resolve,reject)=>{
    pending.set(requestId,{resolve,reject,started});
    worker.postMessage({id:requestId,epoch:requestEpoch,fileId,operation,bytes:buffer,...extra},[buffer]);
  });
}
function request(fileId,operation,extra={},started) {
  const task=fileQueue.then(()=>raw(fileId,operation,extra,started));fileQueue=task.catch(()=>{});return task;
}
function view(){if(!views.has(current))views.set(current,{expanded:[''],pages:{},windowStart:0});return views.get(current);}
function install(fileId,text){files.set(fileId,new File([text],fileId+'.json'));business.set(fileId,{pointer:'',style:'items',status:'queued'});views.delete(fileId);}
install('A','{"results":[{"id":9007199254740993,"text":"ｶﾅ"},{"id":-0,"other":null}],"summary":{"total":2}}');
install('C','{"results":[{"id":1.2300}]}');
async function renderTree(focus) {
  const generation=++treeRequest,file=current,v=view();
  const result=await request(file,'tree',v);
  if(generation!==treeRequest || file!==current || !$('dialog').open)return;
  const fragment=document.createDocumentFragment();
  for(const row of result.rows) {
    const line=document.createElement('div');line.className='row'+(row.pointer===draft.pointer?' chosen':'');line.style.setProperty('--indent',Math.min(row.depth*16,64)+'px');line.dataset.pointer=row.pointer;
    if(['array','object'].includes(row.type) && row.count) {
      const toggle=document.createElement('button');toggle.textContent=v.expanded.includes(row.pointer)?'−':'+';toggle.setAttribute('aria-label',`開閉 ${JSON.stringify(row.key)}`);toggle.setAttribute('aria-expanded',String(v.expanded.includes(row.pointer)));
      toggle.onclick=()=>{v.expanded=v.expanded.includes(row.pointer)?v.expanded.filter(p=>p!==row.pointer):[...v.expanded,row.pointer];renderTree({pointer:row.pointer,toggle:true}).catch(showError);};line.append(toggle);
    }
    if(row.pointer==='' || ['object','array'].includes(row.type)){
      const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='target';radio.value=row.pointer;radio.checked=row.pointer===draft.pointer;radio.setAttribute('aria-label',`${JSON.stringify(row.key)} ${row.type} ${JSON.stringify(row.pointer)}`);
      radio.onchange=()=>select(row.pointer).catch(showError);label.append(radio,document.createTextNode(`${row.pointer===''?'ファイル全体':JSON.stringify(row.key)} ${row.type} ${row.count} 階層${row.depth}`));line.append(label);
    }else {const span=document.createElement('span');span.textContent=`${JSON.stringify(row.key)} ${row.type} ${row.value}`;line.append(span);}
    if(row.count>50 && v.expanded.includes(row.pointer))for(const delta of [-1,1]){
      const pageButton=document.createElement('button');pageButton.textContent=delta===1?'次の50件':'前の50件';const page=v.pages[row.pointer]??0;pageButton.disabled=page+delta<0||(page+delta)*50>=row.count;
      pageButton.onclick=()=>{v.pages[row.pointer]=page+delta;renderTree({pointer:row.pointer,toggle:true}).catch(showError);};line.append(pageButton);
    }
    fragment.append(line);
  }
  $('#tree').replaceChildren(fragment);$('#tree-count').textContent=`表示 ${result.rows.length}／全展開行 ${result.total}`;
  $('#previous-window').disabled=v.windowStart===0;$('#next-window').disabled=v.windowStart+300>=result.total;
  if(focus){const row=[...$('#tree').children].find(r=>r.dataset.pointer===focus.pointer);const target=row?.querySelector(focus.toggle?'button':'input');target?.scrollIntoView({block:'center'});target?.focus();}
}
function showError(error){$('#notice').textContent=error.code??'cancelled';}
async function select(pointer=draft.pointer) {
  draft.pointer=pointer;const generation=++selectionRequest,file=current,captured={...draft};
  $('#selection').textContent=JSON.stringify(pointer);$('#confirm').disabled=true;$('#reason').textContent='出力条件を確認中';$('#detail').textContent='内容を確認中';
  const isCurrent=()=>generation===selectionRequest&&file===current&&$('dialog').open;
  const detail=await request(file,'detail',{pointer});if(!isCurrent())return;
  $('#detail').textContent=detail.text+(detail.complete?'':'\n抜粋');
  try {await request(file,'generate',{pointer,style:captured.style});if(isCurrent()){$('#confirm').disabled=false;$('#reason').textContent='決定可能';}}
  catch(error){if(isCurrent()){$('#confirm').disabled=true;$('#reason').textContent=error.code??'読み込み失敗';}}
  if(isCurrent())await renderTree();
}
async function open(fileId=current){
  current=fileId;draft={pointer:business.get(current).pointer,style:business.get(current).style};
  $('#confirm').disabled=true;$('dialog').showModal();$('#heading').focus();
  for(const radio of document.querySelectorAll('[name=style]'))radio.checked=radio.value===draft.style;
  await select();
}
function close(){selectionRequest++;treeRequest++;$('dialog').close();$('#open').focus();}
$('#open').onclick=()=>open().catch(showError);$('#cancel').onclick=close;
$('dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
$('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const rect=$('dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
$('#confirm').onclick=()=>{business.set(current,{...business.get(current),...draft,status:'queued',result:undefined});close();};
for(const radio of document.querySelectorAll('[name=style]'))radio.onchange=()=>{draft.style=radio.value;select().catch(showError);};
$('#next-window').onclick=()=>{view().windowStart+=300;renderTree().catch(showError);};
$('#previous-window').onclick=()=>{view().windowStart=Math.max(0,view().windowStart-300);renderTree().catch(showError);};
$('#locate').onclick=async()=>{
  const generation=selectionRequest,file=current,pointer=draft.pointer;
  const found=await request(file,'locate',{pointer,...view()});
  if(generation!==selectionRequest||file!==current||!$('dialog').open)return;
  Object.assign(view(),found);await renderTree({pointer});
  if(generation===selectionRequest&&document.activeElement?.value===pointer)$('#notice').textContent='選択位置への移動完了';
};
$('#cancel-worker').onclick=()=>{resetWorker();$('#notice').textContent='Workerを破棄しました';};
const diagram=(location.hash==='#worker'?createWorkerDiagramController:createDiagramController)($('#results'));
if('serviceWorker' in navigator&&!new URL(location.href).searchParams.has('no-sw')){
  await navigator.serviceWorker.register(location.hash==='#worker'?'/alternative-sw.js':'/gate-sw.js');await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
}
window.gates={install,open,select,close,request,raw,resetWorker,diagram,
  inspect:async fileId=>request(fileId,'inspect'),
  convert:async(fileId,pointer='',style='items')=>{const result=await request(fileId,'generate',{pointer,style});business.set(fileId,{pointer,style,status:'success',result});return result;},
  state:()=>({epoch,stats,cancelled,current,draft:{...draft},business:[...business].map(([id,b])=>({id,pointer:b.pointer,style:b.style,status:b.status,hasResult:Boolean(b.result)})),rows:$('#tree').children.length}),
  setView:options=>Object.assign(view(),options),
};
