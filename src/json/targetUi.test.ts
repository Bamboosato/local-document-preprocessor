import {describe,it,expect} from 'vitest';
import {parseText,resolve} from './core.mjs';
import {boundedDetail,targetPage,initialJsonView} from './targetUi';

describe('CUR-01 target presentation (synthetic fixtures)',()=>{
  it.each([299,300,301])('TU-00 handles exactly %i visible rows without mounting extra candidates',count=>{
    // root + seven parents + leaves, with every sibling group below 50.
    const leafCount=count-8;
    const groups=Array.from({length:7},(_,i)=>Array.from({length:Math.floor(leafCount/7)+(i<leafCount%7?1:0)},()=>({})));
    const model=parseText(JSON.stringify(groups));
    const page=targetPage(model,{pointer:'',style:'items'},{...initialJsonView(),expanded:['',...groups.map((_,i)=>`/${i}`)]});
    expect(page.total).toBe(count);expect(page.rows).toHaveLength(Math.min(count,300));
  });
  it.each(['{}','[]','null','"scalar"'])('TU-00 empty containers and root scalar %s stay selectable with no children',source=>{
    const page=targetPage(parseText(source),{pointer:'',style:'items'},initialJsonView());
    expect(page.rows).toHaveLength(1);expect(page.rows[0].selectable).toBe(true);expect(page.children).toHaveLength(0);
    expect(page.styles.find(style=>style.style==='records')?.valid).toBe(false);
  });
  it('TU-01 pages 50 siblings without omitting the 51st candidate or selecting it',()=>{
    const model=parseText(JSON.stringify(Array.from({length:51},()=>({}))));
    const first=targetPage(model,{pointer:'',style:'items'},initialJsonView());
    expect(first.rows.filter(row=>row.kind==='node')).toHaveLength(51);
    expect(first.rows.at(-1)?.kind).toBe('pager');
    const next=targetPage(model,{pointer:'',style:'items'},{...first.view,pages:{'':1}});
    expect(next.rows.map(row=>row.pointer)).toContain('/50');
    expect(next.pointer).toBe('');
    expect(next.children).toHaveLength(10);
  });
  it('TU-02 limits DOM candidates to 300 while every visible row is window reachable',()=>{
    const model=parseText(JSON.stringify(Array.from({length:40},()=>Array.from({length:40},()=>({})))));
    const view={...initialJsonView(),expanded:['',...Array.from({length:40},(_,i)=>`/${i}`)]};
    const page=targetPage(model,{pointer:'/39/39',style:'items'},view);
    expect(page.rows).toHaveLength(300);expect(page.total).toBe(1641);
    const last=targetPage(model,{pointer:'/39/39',style:'items'},{...view,start:1500});
    expect(last.rows.some(row=>row.pointer==='/39/39')).toBe(true);
  });
  it('TU-03 restores ancestors, page and window for escaped, empty and numeric object keys',()=>{
    const model=parseText(JSON.stringify(Object.fromEntries(Array.from({length:51},(_,i)=>[i===50?'a/~':String(i),{'':{'01':{}}}]))));
    const pointer='/a~1~0//01';
    const page=targetPage(model,{pointer,style:'items'},initialJsonView(),true);
    expect(page.view.pages['']).toBe(1);expect(page.view.expanded).toContain('/a~1~0/');
    expect(page.rows.some(row=>row.pointer===pointer)).toBe(true);
    expect(page.selectedIndex).toBeGreaterThan(0);
  });
  it('TU-04 distinguishes identical long prefixes and supports depth 128',()=>{
    const prefix='x'.repeat(400),model=parseText(JSON.stringify({[prefix+'A']:{},[prefix+'B']:{}}));
    const page=targetPage(model,{pointer:'/'+prefix+'B',style:'items'},initialJsonView());
    expect(page.rows[1].name).not.toBe(page.rows[2].name);expect(page.rows[2].name).toContain('B');
    const deep=parseText('['.repeat(128)+'0'+']'.repeat(128));
    const pointer='/0'.repeat(127);
    const revealed=targetPage(deep,{pointer,style:'items'},initialJsonView(),true);
    expect(revealed.rows.some(row=>row.pointer===pointer)).toBe(true);
    expect(revealed.rows.at(-1)?.depth).toBe(127);
  });
  it('TU-05 bounds detail by codepoints, retains numeric tokens and string escapes',()=>{
    const model=parseText('{"n":1e400,"z":-0,"s":"\\n\\\"😀"}');
    const detail=boundedDetail(model,model.root);
    expect(detail.truncated).toBe(false);expect(detail.text).toContain('1e400');expect(detail.text).toContain('-0');expect(detail.text).toContain('\\n\\\"😀');
    const large=parseText(JSON.stringify('😀'.repeat(10001)));
    const bounded=boundedDetail(large,large.root);
    expect(Array.from(bounded.text)).toHaveLength(10000);expect(bounded.truncated).toBe(true);
    const exact=parseText(JSON.stringify('a'.repeat(9998)));
    expect(boundedDetail(exact,exact.root).truncated).toBe(false);
  });
  it('TU-06 reasons and counts track incompatible to compatible without changing requested style',()=>{
    const model=parseText('{"good":[{"a":1},{"b":2}],"bad":{}}');
    const bad=targetPage(model,{pointer:'/bad',style:'records'},initialJsonView());
    expect(bad.styles.find(row=>row.style==='records')).toMatchObject({valid:false,reason:expect.stringContaining('object')});
    const good=targetPage(model,{pointer:'/good',style:'records'},initialJsonView());
    expect(good.styles.find(row=>row.style==='records')).toMatchObject({valid:true,count:'2 データ行 / 3 列'});
    expect(()=>targetPage(model,{pointer:'/missing',style:'items'},initialJsonView())).toThrow();
    expect(resolve(model,'/bad').type).toBe('object');
  });
});
