import {children, encodeSegment, generate, literal, resolve, type JsonModel, type JsonNode} from './core.mjs';
import type {JsonSettings, JsonView, JsonTargetPage, JsonTreeRow, JsonStyle} from './contracts';

export {initialJsonView} from './contracts';
const container = (node:JsonNode) => node.type === 'object' || node.type === 'array';
const childPointer = (parent:string, key:string) => `${parent}/${encodeSegment(key)}`;
const pageNumber = (value:number|undefined, count:number, size:number) => Math.max(0, Math.min(Number.isInteger(value) ? value! : 0, Math.max(0, Math.ceil(count / size)-1)));

// Read directly from the original token range. Stop before allocating the full
// pretty representation; numeric tokens and JSON string escapes remain intact.
export function boundedDetail(model:JsonModel, node:JsonNode, limit=10000) {
  let text='', count=0, depth=0, quoted=false, escaped=false, truncated=false;
  const append=(chunk:string) => {
    for(const cp of chunk) {
      if(count === limit) { truncated=true; return false; }
      text+=cp; count++;
    }
    return true;
  };
  const newline=() => append('\n'+' '.repeat(depth*2));
  const end=node.offset+node.length;
  for(let i=node.offset; i<end;) {
    const cp=String.fromCodePoint(model.source.codePointAt(i)!); i+=cp.length;
    if(quoted) {
      if(!append(cp)) break;
      if(escaped) escaped=false;
      else if(cp==='\\') escaped=true;
      else if(cp==='"') quoted=false;
    } else if(cp==='"') { quoted=true; if(!append(cp)) break; }
    else if(/\s/u.test(cp)) continue;
    else if(cp==='{' || cp==='[') { if(!append(cp)) break; depth++; if(!newline()) break; }
    else if(cp==='}' || cp===']') { depth--; if(!newline() || !append(cp)) break; }
    else if(cp===',') { if(!append(cp) || !newline()) break; }
    else if(cp===':') { if(!append(': ')) break; }
    else if(!append(cp)) break;
  }
  return {text,truncated};
}

const reasons:Record<string,string> = {
  style:'この対象では一覧表を作成できません。空でない object の配列を選択してください。',
  selection:'この対象では一覧表を作成できません。object の配列を選択してください。',
  rows:'行数の上限を超えています。', columns:'列数の上限を超えています。',
  diagramNodes:'構造図のノード数上限（200）を超えています。', label:'構造図のラベル上限（200文字）を超えています。',
  code:'構造図のソース長上限を超えています。', markdown:'Markdown の出力容量上限を超えています。',
};

export function targetPage(model:JsonModel, settings:JsonSettings, requested:JsonView, reveal=false):JsonTargetPage {
  const selected=resolve(model,settings.pointer);
  const view:JsonView={...requested,expanded:[...requested.expanded],pages:{...requested.pages}};
  const expanded=new Set(view.expanded);
  if(reveal) {
    let parent='';
    for(const segment of settings.pointer === '' ? [] : settings.pointer.slice(1).split('/')) {
      const pointer=`${parent}/${segment}`;
      const siblings=children(resolve(model,parent));
      const index=siblings.findIndex(child=>childPointer(parent,child.key)===pointer);
      expanded.add(parent); view.pages[parent]=Math.floor(index/50); parent=pointer;
    }
  }
  view.expanded=[...expanded];
  let total=0, selectedIndex=-1;
  const window:JsonTreeRow[]=[];
  const start=Number.isInteger(view.start) ? Math.max(0,view.start) : 0;
  const visit=(node:JsonNode,pointer:string,name:string,depth:number,collect:boolean) => {
    const index=total++;
    if(pointer===settings.pointer) selectedIndex=index;
    const count=node.children?.length??0;
    const page=pageNumber(view.pages[pointer],count,50);
    if(collect && index>=view.start && window.length<300) window.push({kind:'node',pointer,name,type:node.type,depth,count,expanded:expanded.has(pointer),page,selectable:pointer===''||container(node)});
    if(!container(node)||!expanded.has(pointer)) return;
    const entries=children(node);
    for(const child of entries.slice(page*50,page*50+50)) visit(child.node,childPointer(pointer,child.key),literal(child.key),depth+1,collect);
    if(count>50) {
      const pagerIndex=total++;
      if(collect && pagerIndex>=view.start && window.length<300) window.push({kind:'pager',pointer,name,type:node.type,depth:depth+1,count,expanded:true,page,selectable:false});
    }
  };
  // First count/find the selected row, then collect only the requested window.
  // No full flat tree or full set of DOM radio elements is constructed.
  visit(model.root,'','ファイル全体（ルート）',0,false);
  view.start=reveal ? Math.max(0,selectedIndex-5) : Math.min(start,Math.max(0,total-1));
  total=0; visit(model.root,'','ファイル全体（ルート）',0,true);
  const selectedChildren=children(selected);
  view.detailPage=pageNumber(view.detailPage,selectedChildren.length,10);
  const detail=view.detailOpen ? boundedDetail(model,selected) : {text:'',truncated:false};
  const styles=(['items','records','mermaid'] as JsonStyle[]).map(style=>{
    try {
      const output=generate(model,settings.pointer,style,'fixture.json');
      const count=style==='mermaid' ? `${output.labels?.length??0} ノード` : style==='records' ? `${Math.max(0,(output.rows?.length??1)-1)} データ行 / ${output.rows?.[0]?.length??0} 列` : `${Math.max(0,(output.rows?.length??1)-1)} 行`;
      return {style,valid:true,reason:'この対象で生成できます。',count};
    } catch(error) {
      return {style,valid:false,reason:reasons[(error as {code?:string}).code??'']??'この対象・出力方式は生成条件を満たしません。',count:'生成不可'};
    }
  });
  return {view,rows:window,total,selectedIndex,pointer:settings.pointer,type:selected.type,childCount:selectedChildren.length,
    children:selectedChildren.slice(view.detailPage*10,view.detailPage*10+10).map(child=>({pointer:childPointer(settings.pointer,child.key),name:literal(child.key),type:child.node.type,container:container(child.node),preview:''})),
    detail:detail.text,truncated:detail.truncated,styles};
}
