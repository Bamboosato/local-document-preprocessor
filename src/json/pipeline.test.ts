import {describe,it,expect} from 'vitest';
import {parseText,GateError} from './core.mjs';
import {browseJson,convertJson} from './pipeline';
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
});
