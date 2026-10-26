import {createWorkerDiagramController} from './diagram-worker-host.mjs';

// Display operations never regenerate or reinterpret the verified source.
export function createDiagramView(root,options){
  const get=id=>root.querySelector('#'+id);
  const viewport=get('diagram-viewport'),container=get('diagram'),source=get('diagram-source');
  const buttons={diagram:get('show-diagram'),source:get('show-source'),fit:get('fit-diagram'),in:get('zoom-in'),out:get('zoom-out'),reset:get('reset-zoom'),retry:get('retry-diagram')};
  let candidate,viewMode='diagram',scale=1,svg,base,retryAvailable=false;
  const minimum=0.001,maximum=4;
  const sourceValue=()=>controller.state().outputAllowed?candidate:undefined;
  function applyScale(value){
    if(!svg||!Number.isFinite(value))return;
    scale=Math.max(minimum,Math.min(maximum,value));
    svg.setAttribute('width',String(base.width*scale));svg.setAttribute('height',String(base.height*scale));
    get('zoom-value').textContent=(scale*100).toFixed(scale<0.1?2:0)+'%';
    buttons.in.disabled=viewMode!=='diagram'||scale>=maximum;buttons.out.disabled=viewMode!=='diagram'||scale<=minimum;
  }
  function fit(){if(svg)applyScale(Math.min(viewport.clientWidth/base.width,viewport.clientHeight/base.height,1));}
  function sync(state){
    const permitted=state.outputAllowed&&candidate!==undefined;
    if(state.status==='cleared')retryAvailable=false;
    if(['display-failed','render-timeout','initialization-timeout'].includes(state.status)&&permitted){viewMode='source';retryAvailable=true;}
    source.value=permitted?candidate:'';
    buttons.diagram.disabled=buttons.source.disabled=!permitted;
    buttons.diagram.setAttribute('aria-pressed',String(viewMode==='diagram'));
    buttons.source.setAttribute('aria-pressed',String(viewMode==='source'));
    viewport.hidden=viewMode!=='diagram';source.hidden=viewMode!=='source';
    buttons.retry.hidden=!permitted||!retryAvailable;
    buttons.retry.disabled=buttons.retry.hidden||['initializing','rendering','validating'].includes(state.status);
    const previous=svg;svg=container.querySelector('svg');
    for(const key of ['fit','in','out','reset'])buttons[key].disabled=!svg||viewMode!=='diagram';
    if(svg){const box=svg.viewBox.baseVal;base={width:box.width,height:box.height};if(state.status==='rendered'&&svg!==previous&&viewMode==='diagram')fit();else applyScale(scale);}
    else {base=undefined;scale=1;get('zoom-value').textContent='';}
    get('diagram-status').textContent=({idle:'図はありません',cleared:'図はありません',validating:'出力内容を検証中',validated:'出力内容を検証しました',initializing:'図の表示に必要なデータを読込中',rendering:'図を表示中',rendered:'図を表示しました','validation-failed':'出力を検証できませんでした。設定を再確定して変換を開始してください。','display-failed':'図を表示できませんでした。検証済みソースを利用できます。','render-timeout':'図の表示を中断しました。検証済みソースを利用できます。','initialization-timeout':'図の読込を中断しました。検証済みソースを利用できます。'})[state.status]??'図の状態を確認してください';
  }
  const controller=createWorkerDiagramController(container,{...options,onStateChange:sync});
  buttons.fit.onclick=fit;
  buttons.in.onclick=()=>applyScale(scale*1.25);
  buttons.out.onclick=()=>applyScale(scale/1.25);
  buttons.reset.onclick=()=>{applyScale(1);viewport.scrollTo(0,0);};
  for(const mode of ['diagram','source'])buttons[mode].onclick=()=>{
    if(sourceValue()===undefined)return;
    viewMode=mode;sync(controller.state());
  };
  const retry=()=>{if(!controller.state().validated)return false;viewMode='diagram';return controller.retry();};
  buttons.retry.onclick=retry;
  sync(controller.state());
  return {source:sourceValue,diagram:{
    show:(result,mode)=>{candidate=result.code;viewMode='diagram';return controller.show(result,mode);},
    clear:()=>{candidate=undefined;viewMode='diagram';controller.clear();},
    retry,setMode:controller.setMode,state:()=>({...controller.state(),viewMode,scale}),
  }};
}
