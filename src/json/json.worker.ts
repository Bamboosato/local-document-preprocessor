import {ParseCache} from './core.mjs';
import {browseJson,convertJson} from './pipeline';
import type {JsonRequest} from './contracts';
const cache=new ParseCache();
const scope=self as unknown as {onmessage:((event:MessageEvent<JsonRequest>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data:request}:{data:JsonRequest})=>{
  try{
    const model=cache.get(request.fileId,new Uint8Array(request.buffer));
    let payload;
    if(request.operation==='inspect')payload={selectionKind:'document',supportsSelection:true,sheets:[],json:true};
    else if(request.operation==='browse')payload=browseJson(model,request.settings,request.offset);
    else if(request.operation==='convert')payload=await convertJson(model,request.settings,request.fileName,async code=>{
      const {default:mermaid}=await import('mermaid');
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,suppressErrorRendering:true,maxTextSize:100000});
      await mermaid.parse(code);
    });
    else throw new Error('operation');
    scope.postMessage({id:request.id,operation:request.operation,payload});
  }catch(error){
    const code=(error as {code?:string})?.code??'syntax';
    const limit=['bytes','nodes','depth','rows','columns','markdown','diagramNodes','label','code'].includes(code);
    scope.postMessage({id:request.id,operation:request.operation,error:limit?'resourceLimit':['pointer','selection','style'].includes(code)?'invalidSelection':'jsonInvalid'});
  }
};
