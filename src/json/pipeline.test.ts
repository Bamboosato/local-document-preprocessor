import {describe,it,expect} from 'vitest';
import {parseText,GateError} from './core.mjs';
import {browseJson,convertJson} from './pipeline';
import {suitability} from './targetUi';
describe('JC-01 lossless JSON product adapter',()=>{
  it('retains source numeric tokens, escapes and exact selection without unrelated values',async()=>{
    const m=parseText('{"a/b":{"~key":9007199254740993,"n":-0,"s":"a\\nb"},"other":"EXCLUDED"}');
    const r=await convertJson(m,{pointer:'/a~1b',style:'items'},'fixture.json',async()=>{});
    expect(r.markdown).toContain('9007199254740993');expect(r.plainText).toContain('9007199254740993');expect(r.plainText).toContain('-0');expect(r.markdown).not.toContain('EXCLUDED');expect(r.quality.extractionSource).toBe('json');
    expect(browseJson(m,{pointer:'/a~1b',style:'items'}).rows[0].pointer).toBe('/a~1b/~0key');
  });
  it('requires successful Mermaid validation before any successful result',async()=>{
    const m=parseText('{"a":1}');let calls=0;
    await expect(convertJson(m,{pointer:'',style:'mermaid'},'fixture.json',async()=>{calls++;throw new Error('syntax');})).rejects.toThrow();expect(calls).toBe(1);
    const r=await convertJson(m,{pointer:'',style:'mermaid'},'fixture.json',async()=>{});expect(r.jsonDiagram?.code).toContain('flowchart TD');expect(r.plainText).toContain('flowchart TD');
  });
  it('rejects duplicate or malformed data outside a chosen subtree and non-container targets',()=>{
    for(const text of ['{"a":{},"x":1,"x":2}','{"a":{},"bad":}','{"a":1,}','{"a":NaN}'])expect(()=>parseText(text)).toThrow(GateError);
    expect(browseJson(parseText('{"a":1}'),{pointer:'/a',style:'items'}).valid).toBe(false);
  });
  it('supports scalar root and records but rejects incompatible styles; pages stay bounded',async()=>{
    expect((await convertJson(parseText('1e400'),{pointer:'',style:'items'},'fixture.json',async()=>{})).plainText).toContain('1e400');
    const r=await convertJson(parseText('[{"a":1},{"b":2}]'),{pointer:'',style:'records'},'fixture.json',async()=>{});expect(r.plainText).toContain('（項目なし）');
    expect(browseJson(parseText('{}'),{pointer:'',style:'records'}).valid).toBe(false);
    const many=parseText(JSON.stringify(Array.from({length:301},(_,i)=>i)));
    expect(browseJson(many,{pointer:'',style:'items'}).rows).toHaveLength(300);expect(browseJson(many,{pointer:'',style:'items'},300).rows).toHaveLength(1);
  });
  it('filters direct array children for every format and retains original positions and descendants',async()=>{
    const model=parseText('{"a":["OMIT_TEXT",{"keep":-0},[42],{"OMIT_COLUMN":true},{"keep":9007199254740993}],"outside":"OMIT_OUTSIDE"}');
    const filename='fixture.json', validate=async()=>{};
    const arraySelection={all:false,exceptions:[4,1]};
    const settings={pointer:'/a',arraySelection};
    expect(suitability(model,'/a').find(style=>style.style==='records')?.valid).toBe(false);
    expect(suitability(model,'/a',arraySelection).find(style=>style.style==='records')?.valid).toBe(true);
    const records=await convertJson(model,{...settings,style:'records'},filename,validate);
    expect(records.markdown).toMatch(/\| `1` \| .*?-0.*\|\n\| `4` \| .*?9007199254740993/);
    expect(records.markdown).not.toContain('OMIT');

    for(const style of ['items','mermaid'] as const){
      const result=await convertJson(model,{pointer:'/a',style,arraySelection:{all:true,exceptions:[0,3]},diagramDirection:'LR'},filename,validate);
      expect(result.markdown).not.toContain('OMIT');
      expect(result.plainText).toContain('42');
      if(style==='items')expect(result.markdown).toContain('/a/2/0');
      else expect(result.jsonDiagram?.code).toContain('flowchart LR');
    }
    expect(suitability(model,'/a',{all:false,exceptions:[]}).every(style=>!style.valid)).toBe(true);
    await expect(convertJson(model,{pointer:'/a',style:'items',arraySelection:{all:false,exceptions:[5]}},filename,validate)).rejects.toMatchObject({code:'selection'});
  });
  it('checks the diagram limit against the selected children',()=>{
    const model=parseText(JSON.stringify(Array.from({length:200},()=>0)));
    const diagram=(arraySelection?:{all:boolean;exceptions:number[]})=>suitability(model,'',arraySelection).find(style=>style.style==='mermaid');
    expect(diagram()?.valid).toBe(false);
    expect(diagram({all:true,exceptions:[0]})).toMatchObject({valid:true,count:'200 ノード'});
  });
});
