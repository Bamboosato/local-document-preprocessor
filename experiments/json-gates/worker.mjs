import { ParseCache, resolve, children, generate, literal, valueText, encodeSegment } from './core.mjs';
const cache = new ParseCache();
function treeRows(model, expanded, pages) {
  const rows = [];
  const visit = (node, pointer, key, depth) => {
    rows.push({pointer, key, type:node.type, count:children(node).length, depth, value:['object','array'].includes(node.type)?'':valueText(model,node).slice(0,160)});
    if (expanded.includes(pointer)) {
      const list = children(node), page = pages[pointer] ?? 0;
      for (const child of list.slice(page*50,page*50+50)) visit(child.node, `${pointer}/${encodeSegment(child.key)}`, child.key, depth+1);
    }
  };
  visit(model.root,'','root',0);
  return rows;
}
// Output is bounded as it is constructed: the entire subtree is not serialized
// just to throw most of it away. Numeric tokens are read from source spans.
function excerpt(model, node, budget=10000) {
  let output='', used=0;
  const append = str => {
    for (const ch of str) { if (used >= budget) return false; output+=ch; used++; }
    return true;
  };
  const visit = node => {
    if (node.type==='object' || node.type==='array') {
      const object=node.type==='object'; if (!append(object?'{':'[')) return false;
      let index=0;
      for (const child of children(node)) {
        if (index++ && !append(',')) return false;
        if (object && !append(literal(child.key)+':')) return false;
        if (!visit(child.node)) return false;
      }
      return append(object?'}':']');
    }
    if (node.type==='number') return append(model.source.slice(node.offset,node.offset+node.length));
    if (node.type==='string') {
      if (!append('"')) return false;
      for (const ch of node.value) if (!append(literal(ch).slice(1,-1))) return false;
      return append('"');
    }
    return append(literal(node.value));
  };
  const complete=visit(node); return {text:output,complete};
}
self.onmessage = async event => {
  const q=event.data;
  try {
    if(q.operation==='crash') { setTimeout(()=>{throw new Error('synthetic worker failure');},0); return; }
    if(q.operation==='busy') {
      self.postMessage({id:q.id, epoch:q.epoch, busy:true});
      const end=performance.now()+q.milliseconds; while(performance.now()<end) {}
      return;
    }
    if(q.operation==='pdf') {
      cache.reset();
      const [{AnyDocConverter},{convertWithPageBreaks},{PdfiumTextExtractor},{PdfPageProcessor}] = await Promise.all([
        import('../../src/converter/AnyDocConverter.ts'), import('../../src/conversion/convertWithPageBreaks.ts'),
        import('../../src/converter/PdfiumTextExtractor.ts'), import('../../src/selection/PdfPageProcessor.ts'),
      ]);
      const converter=new AnyDocConverter();
      const processor=new PdfPageProcessor(new PdfiumTextExtractor());
      self.postMessage({id:q.id, epoch:q.epoch, pdfStarted:true});
      const result=await convertWithPageBreaks(converter,{fileName:'synthetic-B.pdf',bytes:new Uint8Array(q.bytes)},false,processor);
      self.postMessage({id:q.id,epoch:q.epoch,result:{pdfConverted:true,hasOutput:Boolean(result.markdown)},stats:cache.stats()}); return;
    }
    const model=cache.get(q.fileId,new Uint8Array(q.bytes));
    let result;
    if(q.operation==='inspect') result={count:model.count,type:model.root.type};
    else if(q.operation==='tree') {
      const rows=treeRows(model,q.expanded,q.pages);
      result={rows:rows.slice(q.windowStart,q.windowStart+300),total:rows.length};
    } else if(q.operation==='locate') {
      resolve(model,q.pointer);
      const expanded=[...q.expanded],pages={...q.pages};let node=model.root,path='';
      if(q.pointer!=='') for(const segment of q.pointer.slice(1).split('/')) {
        if(!expanded.includes(path))expanded.push(path);
        const list=children(node),index=list.findIndex(c=>encodeSegment(c.key)===segment);
        pages[path]=Math.floor(index/50);node=list[index].node;path+='/'+segment;
      }
      const rows=treeRows(model,expanded,pages);
      result={expanded,pages,windowStart:Math.floor(rows.findIndex(row=>row.pointer===q.pointer)/300)*300};
    } else if(q.operation==='detail') result=excerpt(model,resolve(model,q.pointer));
    else if(q.operation==='generate') result=generate(model,q.pointer,q.style,q.fileId+'.json');
    self.postMessage({id:q.id,epoch:q.epoch,result,stats:cache.stats()});
  } catch(error) {
    self.postMessage({id:q.id,epoch:q.epoch,error:error.code??'prototype',stats:cache.stats()});
  }
};
