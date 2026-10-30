import {it,expect} from 'vitest';
import {parseText,generate,ParseCache} from './core.mjs';
import {suitability,targetPage,initialJsonView} from './targetUi';

it('SR-07 evicts each of 20 parsed inputs; revisiting A reparses it and preserves its value',()=>{
  const cache=new ParseCache(),bytes=(id:number)=>new TextEncoder().encode(JSON.stringify({id}));
  for(let i=0;i<20;i++){cache.get(String(i),bytes(i));expect(cache.stats().sets).toBe(1);}
  expect(cache.stats().parses).toBe(20);const a=cache.get('0',bytes(0));expect(cache.stats().parses).toBe(21);
  expect(generate(a).markdown).toContain('`0`');cache.reset();expect(cache.stats().sets).toBe(0);
});
it('SR-08 giant scalar cannot become truncated success; all styles reject and the original parse remains usable',()=>{
  const model=parseText(JSON.stringify('x'.repeat(10*1024**2+1)));
  expect(()=>generate(model,'','items')).toThrow('markdown');expect(()=>generate(model,'','mermaid')).toThrow('label');
  const styles=suitability(model,'');expect(styles.every(style=>!style.valid)).toBe(true);
  const detail=targetPage(model,{pointer:'',style:'items'},{...initialJsonView(),detailOpen:true});
  expect(detail.detail.length).toBe(10000);expect(detail.truncated).toBe(true);expect(model.root.type).toBe('string');
});
it('SR-09 diagram node preflight and cumulative Markdown budget reject whole outputs',()=>{
  const many=parseText(JSON.stringify(Array.from({length:1000},()=>null)));
  expect(()=>generate(many,'','mermaid')).toThrow('diagramNodes');
  const rows=parseText(JSON.stringify([{a:'a'.repeat(6*1024**2)},{a:'b'.repeat(6*1024**2)}]));
  expect(()=>generate(rows,'','records')).toThrow('markdown');
});
