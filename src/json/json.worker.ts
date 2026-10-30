import {ParseCache} from './core.mjs';
import {browseJson,convertJson} from './pipeline';
import type {JsonRequest} from './contracts';
import {targetPage,suitability} from './targetUi';
const cache=new ParseCache();
let cachedGeneration:number|undefined;
const scope=self as unknown as {onmessage:((event:MessageEvent<JsonRequest>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data:request}:{data:JsonRequest})=>{
  try{
    if(request.operation==='release'){
      cache.reset();cachedGeneration=undefined;scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,payload:{released:true}});return;
    }
    if(!request.buffer&&cachedGeneration!==request.parseGeneration)throw {code:'cache'};
    const model=cache.get(request.fileId,request.buffer?new Uint8Array(request.buffer):new Uint8Array());
    cachedGeneration=request.parseGeneration;
    let payload;
    if(request.operation==='inspect')payload={selectionKind:'document',supportsSelection:true,sheets:[],json:true,jsonInitialValid:suitability(model,'').find(style=>style.style==='items')?.valid===true};
    else if(request.operation==='browse')payload=browseJson(model,request.settings,request.offset);
    else if(request.operation==='target'&&request.view)payload=targetPage(model,request.settings,request.view,request.reveal);
    else if(request.operation==='convert')payload=await convertJson(model,request.settings,request.fileName,async code=>{
      let mermaid;
      try{mermaid=(await import('mermaid')).default;}catch{throw {code:'initialization'};}
      try{
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,suppressErrorRendering:true,maxTextSize:100000});
        await mermaid.parse(code);
      }catch{throw {code:'verification'};}
    });
    else throw new Error('operation');
    scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,payload});
  }catch(error){
    const code=(error as {code?:string})?.code??'syntax';
    const limit=['bytes','nodes','depth','rows','columns','markdown','diagramNodes','label','code'].includes(code);
    scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,error:code==='initialization'?'initializationFailed':['verification','cache'].includes(code)?'conversionFailed':limit?'resourceLimit':['pointer','selection','style'].includes(code)?'invalidSelection':'jsonInvalid'});
  }
};
