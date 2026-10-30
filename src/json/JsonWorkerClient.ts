import type {ConversionResult,DocumentInspection,ConversionErrorCode} from '../converter/contracts';
import {WorkerConversionError} from '../converter/ConverterWorkerClient';
import {defaultJsonSettings,type JsonOperation,type JsonSettings,type JsonPage} from './contracts';
import type {JsonView,JsonTargetPage} from './contracts';

export class JsonWorkerClient {
  private worker?:Worker;
  private generation=0;
  private fileIds=new WeakMap<File,string>();
  private pending=new Map<string,{operation:JsonOperation;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;cleanup:()=>void}>();
  constructor(private factory:()=>Worker=()=>new Worker(new URL('./json.worker.ts',import.meta.url),{type:'module',name:'local-json-converter'})){}
  inspect(file:File,signal?:AbortSignal){return this.request<DocumentInspection>(file,'inspect',defaultJsonSettings,0,signal);}
  browse(file:File,settings:JsonSettings,offset=0,signal?:AbortSignal){return this.request<JsonPage>(file,'browse',settings,offset,signal);}
  target(file:File,settings:JsonSettings,view:JsonView,reveal=false,signal?:AbortSignal){return this.request<JsonTargetPage>(file,'target',settings,0,signal,{view:structuredClone(view),reveal});}
  convert(file:File,settings:JsonSettings,signal?:AbortSignal){return this.request<ConversionResult>(file,'convert',settings,0,signal);}
  private ensure(){
    if(this.worker)return this.worker;
    const worker=this.factory(),generation=this.generation;this.worker=worker;
    worker.onmessage=({data})=>{
      if(this.worker!==worker||generation!==this.generation)return;
      const p=this.pending.get(data?.id);if(!p||p.operation!==data.operation)return;
      this.pending.delete(data.id);p.cleanup();
      if(data.error)p.reject(new WorkerConversionError(data.error as ConversionErrorCode));
      else if(!validPayload(p.operation,data.payload))p.reject(new WorkerConversionError('conversionFailed'));
      else p.resolve(data.payload);
    };
    worker.onerror=event=>{event.preventDefault();this.cancel(new WorkerConversionError('conversionFailed'));};return worker;
  }
  private async request<T>(file:File,operation:JsonOperation,settings:JsonSettings,offset:number,signal?:AbortSignal,extra?:{view:JsonView;reveal:boolean}):Promise<T>{
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    const generation=this.generation,buffer=await file.arrayBuffer();
    if(signal?.aborted||generation!==this.generation)throw new DOMException('Cancelled','AbortError');
    const worker=this.ensure(),id=crypto.randomUUID();
    const fileId=this.fileIds.get(file)??crypto.randomUUID();this.fileIds.set(file,fileId);
    return new Promise<T>((resolve,reject)=>{
      const abort=()=>{
        if(operation!=='target'){this.cancel();return;}
        const pending=this.pending.get(id);this.pending.delete(id);pending?.cleanup();pending?.reject(new DOMException('Cancelled','AbortError'));
      };
      const timer=setTimeout(()=>this.cancel(new WorkerConversionError('resourceLimit')),30000);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      this.pending.set(id,{operation,resolve:value=>resolve(value as T),reject,cleanup});
      signal?.addEventListener('abort',abort,{once:true});
      try{worker.postMessage({id,operation,fileId,fileName:file.name,buffer,settings:{...settings},offset,...extra},[buffer]);}catch{this.cancel(new WorkerConversionError('initializationFailed'));}
    });
  }
  cancel(error:unknown=new DOMException('Cancelled','AbortError')){this.generation++;this.worker?.terminate();this.worker=undefined;for(const p of this.pending.values()){p.cleanup();p.reject(error);}this.pending.clear();}
  dispose(){this.cancel();}
}

function validPayload(operation:JsonOperation,value:unknown):boolean {
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  if(operation==='inspect')return v.json===true&&v.selectionKind==='document'&&Array.isArray(v.sheets);
  if(operation==='target')return validTarget(v);
  if(operation==='browse')return typeof v.pointer==='string'&&typeof v.valid==='boolean'&&Number.isInteger(v.total)&&Number.isInteger(v.offset)&&Array.isArray(v.rows)&&v.rows.length<=300&&v.rows.every(row=>row&&typeof row.pointer==='string'&&typeof row.name==='string'&&typeof row.container==='boolean');
  const q=v.quality as Record<string,unknown>|undefined;
  return typeof v.markdown==='string'&&typeof v.plainText==='string'&&v.detectedFormat==='JSON'&&q?.safeToExport===true&&q.extractionSource==='json'&&q.disposition==='success'&&Array.isArray(q.issues)&&(!v.jsonDiagram||typeof (v.jsonDiagram as {code?:unknown}).code==='string');
}

function nonnegative(value:unknown):value is number {return Number.isSafeInteger(value)&&(value as number)>=0;}
function validTarget(v:Record<string,unknown>):boolean {
  const view=v.view as JsonView|undefined;
  if(!view||!Array.isArray(view.expanded)||!view.expanded.every(pointer=>typeof pointer==='string')||!view.pages||typeof view.pages!=='object'||!Object.values(view.pages).every(nonnegative)||!nonnegative(view.start)||!nonnegative(view.detailPage)||typeof view.detailOpen!=='boolean')return false;
  return typeof v.pointer==='string'&&typeof v.type==='string'&&nonnegative(v.childCount)&&typeof v.detail==='string'&&Array.from(v.detail).length<=10000&&typeof v.truncated==='boolean'&&nonnegative(v.total)&&Number.isInteger(v.selectedIndex)&&
    Array.isArray(v.rows)&&v.rows.length<=300&&v.rows.every(row=>row&&['node','pager'].includes(row.kind)&&typeof row.pointer==='string'&&typeof row.name==='string'&&typeof row.type==='string'&&nonnegative(row.depth)&&row.depth<=128&&nonnegative(row.count)&&nonnegative(row.page)&&typeof row.expanded==='boolean'&&typeof row.selectable==='boolean')&&
    Array.isArray(v.children)&&v.children.length<=10&&v.children.every(row=>row&&typeof row.pointer==='string'&&typeof row.name==='string'&&typeof row.type==='string'&&typeof row.container==='boolean')&&
    Array.isArray(v.styles)&&v.styles.length===3&&new Set(v.styles.map(style=>style?.style)).size===3&&v.styles.every(style=>style&&['items','records','mermaid'].includes(style.style)&&typeof style.valid==='boolean'&&typeof style.reason==='string'&&typeof style.count==='string');
}
