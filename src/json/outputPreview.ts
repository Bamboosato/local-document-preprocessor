export const JSON_PREVIEW_BYTES=50*1024;
const excerptLimit=10000;

// JSON generation produces one GFM table, with JSON-escaped newlines inside
// cells. Scan line boundaries without splitting/copying the whole result.
// Large pages are plain source excerpts, never half-parsed Markdown cells.
function previewSpans(source:string,spans:[number,number][]){
  const length=spans.reduce((size,[start,end])=>size+end-start,0);
  if(length<=JSON_PREVIEW_BYTES){
    const text=spans.map(([start,end])=>source.slice(start,end)).join('');
    if(new TextEncoder().encode(text).length<=JSON_PREVIEW_BYTES)return {text,excerpt:false};
  }
  let text='',count=0;
  for(const [start,end]of spans)for(let i=start;i<end;){
    if(count===excerptLimit)return {text,excerpt:true};
    const cp=String.fromCodePoint(source.codePointAt(i)!);text+=cp;i+=cp.length;count++;
  }
  return {text,excerpt:true};
}
export function boundedTextPreview(source:string){return previewSpans(source,[[0,source.length]]);}
export function jsonTablePagePreview(source:string,page:number){
  const table=source.indexOf('\n| ')+1;
  if(table===0)return boundedTextPreview(source);
  const headerEnd=source.indexOf('\n',table),separatorEnd=source.indexOf('\n',headerEnd+1);
  if(headerEnd<0||separatorEnd<0)return boundedTextPreview(source);
  const dataStart=separatorEnd+1;
  let start=dataStart;
  for(let i=0;i<Math.max(0,page)*100&&start<source.length;i++){
    const end=source.indexOf('\n',start);start=end<0?source.length:end+1;
  }
  let end=start;
  for(let i=0;i<100&&end<source.length;i++){const next=source.indexOf('\n',end);end=next<0?source.length:next+1;}
  return previewSpans(source,[[0,dataStart],[start,end]]);
}
