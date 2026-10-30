import type {ConversionResult,DocumentInspection,ConversionErrorCode} from '../converter/contracts';
import {WorkerConversionError} from '../converter/ConverterWorkerClient';
import {defaultJsonSettings,type JsonOperation,type JsonSettings,type JsonPage} from './contracts';
import type {JsonView,JsonTargetPage} from './contracts';
import {readFileBytes} from '../converter/readFileBytes';

// File.arrayBuffer has no abort operation. FileReader lets cancellation and the
// read deadline release the input before the next serialized request begins.
export function readJsonFile(file:File,signal:AbortSignal):Promise<ArrayBuffer>{
  return readFileBytes(file,signal,code=>new WorkerConversionError(code));
}

export class JsonWorkerClient {
  private worker?:Worker;
  private generation=0;
  private parseGeneration=0;
  private residentFileId?:string;
  private tail:Promise<void>=Promise.resolve();
  private jobs=new Set<{reject:(error:unknown)=>void;cleanup:()=>void}>();
  private fileIds=new WeakMap<File,string>();
  private pending=new Map<string,{operation:JsonOperation;fileId:string;parseGeneration:number;settings:JsonSettings;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;cleanup:()=>void}>();
  constructor(private factory:()=>Worker=()=>new Worker(new URL('./json.worker.ts',import.meta.url),{type:'module',name:'local-json-converter'}),private readBytes:(file:File,signal:AbortSignal)=>Promise<ArrayBuffer>=readJsonFile){}
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
      if(data.fileId!==p.fileId||data.parseGeneration!==p.parseGeneration||data.settings?.pointer!==p.settings.pointer||data.settings?.style!==p.settings.style){this.residentFileId=undefined;p.reject(new WorkerConversionError('conversionFailed'));}
      else if(data.error){this.residentFileId=undefined;const error=new WorkerConversionError(data.error as ConversionErrorCode);p.reject(error);if(p.operation==='convert')this.cancel(error);}
      else if(!validPayload(p.operation,data.payload)||(p.operation==='target'&&data.payload.pointer!==p.settings.pointer)){this.residentFileId=undefined;p.reject(new WorkerConversionError('conversionFailed'));}
      else {this.residentFileId=p.operation==='release'?undefined:p.fileId;p.resolve(data.payload);}
    };
    worker.onerror=event=>{event.preventDefault();if(this.worker===worker&&generation===this.generation)this.cancel(new WorkerConversionError('conversionFailed'));};return worker;
  }
  private request<T>(file:File,operation:JsonOperation,settings:JsonSettings,offset:number,signal?:AbortSignal,extra?:{view:JsonView;reveal:boolean}):Promise<T>{
    const generation=this.generation,snapshot={...settings};
    let aborted=signal?.aborted??false,active=false;
    return new Promise<T>((resolve,reject)=>{
      const readController=new AbortController();
      const abort=()=>{aborted=true;if(active)this.cancel();else {job.cleanup();reject(new DOMException('Cancelled','AbortError'));}};
      const job={reject,cleanup:()=>{readController.abort();signal?.removeEventListener('abort',abort);this.jobs.delete(job);}};
      this.jobs.add(job);signal?.addEventListener('abort',abort,{once:true});
      // Wait for the reader to settle after abort before starting another input.
      const task=this.tail.then(async()=>{
        const check=()=>{if(aborted||generation!==this.generation)throw new DOMException('Cancelled','AbortError');};
        check();
        if(file.size>50*1024**2)throw new WorkerConversionError('resourceLimit');
        const fileId=this.fileIds.get(file)??crypto.randomUUID();this.fileIds.set(file,fileId);
        let buffer:ArrayBuffer|undefined;
        if(this.residentFileId&&this.residentFileId!==fileId){
          active=true;await this.exchange(this.ensure(),'release',this.residentFileId,defaultJsonSettings,0);active=false;check();
        }
        if(this.residentFileId!==fileId){this.residentFileId=undefined;buffer=await this.readBytes(file,readController.signal);check();this.parseGeneration++;}
        active=true;
        return this.exchange(this.ensure(),operation,fileId,snapshot,offset,buffer,extra,file.name);
      });
      this.tail=task.then(()=>{},()=>{});
      void task.then(value=>{active=false;job.cleanup();resolve(value as T);},error=>{active=false;job.cleanup();reject(error);});
    });
  }
  private exchange(worker:Worker,operation:JsonOperation,fileId:string,settings:JsonSettings,offset:number,buffer?:ArrayBuffer,extra?:{view:JsonView;reveal:boolean},fileName=''){
    const id=crypto.randomUUID(),parseGeneration=this.parseGeneration;
    return new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>this.cancel(new WorkerConversionError('resourceLimit')),30000);
      this.pending.set(id,{operation,fileId,parseGeneration,settings,resolve,reject,cleanup:()=>clearTimeout(timer)});
      try{worker.postMessage({id,operation,fileId,fileName,parseGeneration,buffer,settings,offset,...extra},buffer?[buffer]:[]);}catch{this.cancel(new WorkerConversionError('initializationFailed'));}
    });
  }
  cancel(error:unknown=new DOMException('Cancelled','AbortError')){this.generation++;this.worker?.terminate();this.worker=undefined;this.residentFileId=undefined;for(const p of this.pending.values()){p.cleanup();p.reject(error);}this.pending.clear();for(const job of [...this.jobs]){job.cleanup();job.reject(error);}}
  dispose(){this.cancel();}
}

function validPayload(operation:JsonOperation,value:unknown):boolean {
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  if(operation==='release')return v.released===true;
  if(operation==='inspect')return v.json===true&&typeof v.jsonInitialValid==='boolean'&&v.selectionKind==='document'&&Array.isArray(v.sheets);
  if(operation==='target')return validTarget(v);
  if(operation==='browse')return typeof v.pointer==='string'&&typeof v.valid==='boolean'&&Number.isInteger(v.total)&&Number.isInteger(v.offset)&&Array.isArray(v.rows)&&v.rows.length<=300&&v.rows.every(row=>row&&typeof row.pointer==='string'&&typeof row.name==='string'&&typeof row.container==='boolean');
  const q=v.quality as Record<string,unknown>|undefined;
  const diagram=typeof (v.jsonDiagram as {code?:unknown}|undefined)?.code==='string';
  const table=v.jsonTable as {rows?:unknown}|undefined;
  const paginated=nonnegative(table?.rows)&&table.rows>0&&table.rows<=10000;
  return typeof v.markdown==='string'&&typeof v.plainText==='string'&&v.detectedFormat==='JSON'&&q?.safeToExport===true&&q.extractionSource==='json'&&q.disposition==='success'&&Array.isArray(q.issues)&&((diagram&&!table)||(paginated&&!v.jsonDiagram));
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
