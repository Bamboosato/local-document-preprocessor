import {GateError, ParseCache} from './core.mjs';
import type {ConversionErrorCode} from '../converter/contracts';
import {browseJson,convertJson} from './pipeline';
import type {JsonRequest} from './contracts';
import {targetPage,suitability} from './targetUi';
import {loadTiny} from './tinyLoader.mjs';
const inputErrors: ReadonlyMap<string, ConversionErrorCode> = new Map([
  ['encoding', 'jsonEncoding'],
  ['syntax', 'jsonSyntax'],
  ['duplicate', 'jsonDuplicateKey'],
  ['unicode', 'jsonUnicode'],
]);
const cache=new ParseCache();
let cachedGeneration:number|undefined;
const scope=self as unknown as {onmessage:((event:MessageEvent<JsonRequest>)=>void)|null;postMessage:(value:unknown)=>void};
export const handleJsonRequest=async({data:request}:{data:JsonRequest})=>{
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
      try{mermaid=await loadTiny();}catch{throw {code:'initialization'};}
      try{
        await mermaid.parse(code);
      }catch{throw {code:'verification'};}
    });
    else throw new Error('operation');
    scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,payload});
  }catch(error){
    const code=(error as {code?:string})?.code??'';
    const inputError=error instanceof GateError ? inputErrors.get(code) : undefined;
    const limit=['bytes','nodes','depth','rows','columns','markdown','diagramNodes','label','code'].includes(code);
    let errorCode: ConversionErrorCode = 'conversionFailed';
    if (inputError) errorCode = inputError;
    else if (limit) errorCode = 'resourceLimit';
    else if (code === 'initialization') errorCode = 'initializationFailed';
    else if (['pointer','selection','style','emptyArraySelection'].includes(code)) errorCode = 'invalidSelection';
    scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,error:errorCode});
  }
};
