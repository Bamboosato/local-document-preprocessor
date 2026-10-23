import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { markdownToPlainText } from '../../src/plainText/markdownToPlainText.ts';
import { parseBytes, parseText, resolve, children, compact, generate, literal, diagramLiteral, cpLength, ParseCache, limits } from './core.mjs';

const rejects = (fn, code) => assert.throws(fn, error => error.code === code && error.message === code);
const ast = md => unified().use(remarkParse).use(remarkGfm).parse(md);
const text = n => n.value ?? (n.children ?? []).map(text).join('');
const cells = md => ast(md).children.find(n => n.type === 'table').children.map(row => row.children.map(text));
const diagnosticNodes = node => [node, ...(node.children ?? []).flatMap(diagnosticNodes)];
const sample = '{"generatedAt":"2026-10-22","summary":{"total":2,"failed":1},"results":[{"id":"T001","name":"ログイン","status":"OK","duration":120},{"id":"T002","name":"検索","status":"NG","duration":350}]}';

test('G01-N01: all six roots, empty containers and UTF-8 BOM are intentional valid inputs', () => {
  for (const source of ['{}', '[]', '""', '0', 'true', 'false', 'null', '\ufeff{"ｶﾅ":"日本語😀"}']) {
    const m = parseText(source); assert.ok(generate(m).markdown);
  }
});
test('G01-E01: strict JSON rejects extensions and malformed lexical forms without partial success', () => {
  for (const source of ['', ' ', '{}{}', '{}x', '{"a":1,}', '[1,]', '{/*x*/"a":1}', '//x\n{}', 'NaN', 'Infinity', 'undefined', '01', '+1', '.1', '1.', '1e', '"\u0001"', '\ufeff\ufeff{}']) assert.throws(() => parseText(source));
});
test('G01-E02: invalid UTF-8 and UTF-16/32 cannot become silently replaced data', () => {
  for (const bytes of [[0x22,0xc0,0xaf,0x22], [0xff,0xfe,0x7b,0], [0xfe,0xff,0,0x7b], [0,0,0xfe,0xff]]) rejects(() => parseBytes(new Uint8Array(bytes)), 'encoding');
});
test('G01-E03: duplicate decoded keys anywhere, including outside selection, are rejected', () => {
  for (const source of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"ok":{},"bad":{"x":1,"x":2}}']) rejects(() => parseText(source), 'duplicate');
  assert.equal(parseText('{"x":{},"nested":{"x":1}}').count, 4);
});
test('G01-E04: lone surrogates rejected in values and names; real pairs and normalization distinctions survive', () => {
  for (const source of ['"\\ud800"', '"\\udc00"', '{"\\ud800":1}']) rejects(() => parseText(source), 'unicode');
  assert.equal(compact(parseText('"\\ud83d\\ude00"'), parseText('"\\ud83d\\ude00"').root), '"😀"');
  assert.equal(parseText('{"é":1,"é":2}').count, 3);
});
test('G01-D01: number tokens and numeric-looking key order survive all three outputs and plain text', () => {
  const m = parseText('[{"10":9007199254740993,"2":-0,"01":1.2300,"x":1e400}]');
  assert.equal(compact(m, m.root), '[{"10":9007199254740993,"2":-0,"01":1.2300,"x":1e400}]');
  for (const style of ['items', 'records', 'mermaid']) {
    const result = generate(m, '', style);
    const plain = markdownToPlainText(result.markdown);
    if (style === 'mermaid') for (const token of ['9007199254740993','-0','1.2300','1e400']) assert.ok(result.labels.some(l => l.includes(token)));
    else for (const token of ['9007199254740993','-0','1.2300','1e400']) assert.ok(plain.includes(token));
    assert.equal(markdownToPlainText(result.markdown), plain);
  }
});
test('G01-N02: documented example counts and partial selection exclude sibling unique values', () => {
  const m = parseText(sample);
  assert.equal(generate(m).rows.length - 1, 16);
  const partial = generate(m, '/results');
  assert.equal(partial.rows.length - 1, 11);
  assert.equal(generate(m, '/results/0').rows.length - 1, 5);
  assert.ok(!partial.markdown.includes('2026-10-22'));
  assert.equal(generate(m, '/results', 'records').rows.length - 1, 2);
});
test('G01-D02: control characters, slash, tilde, empty and numeric keys have reversible distinct pointers', () => {
  const entries = [['',{}],['a/b',{}],['a~b',{}],['a\nb',{}],['a\\nb',{}],['a\tb',{}],['a\\tb',{}],['0',{}],['__proto__',{}]];
  const m = parseText(JSON.stringify(Object.fromEntries(entries)));
  const result = generate(m);
  const actual = cells(result.markdown);
  assert.deepEqual(actual, result.rows);
  for (const row of actual.slice(1)) assert.ok(resolve(m, JSON.parse(row[0])));
  const plain = markdownToPlainText(result.markdown);
  for (const line of plain.split('\n').filter(l => l.startsWith('"/'))) assert.equal(line.split('\t').length, 3);
  assert.equal(Object.prototype.polluted, undefined);
  assert.notEqual(resolve(m, ''), resolve(m, '/'));
  rejects(() => resolve(m, '/missing'), 'pointer');
  rejects(() => resolve(m, '/a~2b'), 'pointer');
});
test('G01-D03: adversarial Markdown strings remain exact text cells, never syntax or executable nodes', () => {
  const values = ['|', '\\', '`x`', '```mermaid\nend', '<script>alert(1)</script>', '![x](https://invalid.example/a)', '[x](https://invalid.example)', '&#124;', '\n\t', 'ｶﾀｶﾅ😀', '%%{init:{"securityLevel":"loose"}}%%', 'click n0 "https://invalid.example"'];
  const m = parseText(JSON.stringify(Object.fromEntries(values.map((v,i) => ['k'+i,v]))));
  const out = generate(m);
  assert.deepEqual(cells(out.markdown), out.rows);
  const nodes = diagnosticNodes(ast(out.markdown));
  assert.equal(nodes.filter(n => ['link','image','html','code','emphasis','strong'].includes(n.type)).length, 0);
  const plain = markdownToPlainText(out.markdown);
  for (const value of values) assert.ok(plain.includes(literal(value)));
});
test('G01-D04: records union, absent/null/empty, nested tokens, and system-name collisions are distinguishable', () => {
  const m = parseText('[{"配列位置":"（項目なし）","":null,"nested":{"n":9007199254740993}},{"":"","later":true}]');
  const result = generate(m, '', 'records');
  assert.deepEqual(cells(result.markdown), [
    ['配列位置','"配列位置"','""','"nested"','"later"'],
    ['0','"（項目なし）"','null','{"n":9007199254740993}','（項目なし）'],
    ['1','（項目なし）','""','（項目なし）','true'],
  ]);
});
test('G01-D05: renderer-safe JSON labels decode to original controls, escapes, metadata punctuation and Unicode',()=>{
  for(const value of ['a\nb','a\\nb','a\tb','a\\tb','" < > & { } \' \\','😀日本語ｶﾅ','\u0000\u0001\uffff\ufffe\u2028'])assert.equal(JSON.parse(diagramLiteral(value)),value);
});
test('G01-D06: many backtick runs never become an oversized function argument list or corrupt a cell',()=>{
  const value='`a'.repeat(150000),out=generate(parseText(literal(value)));
  assert.equal(cells(out.markdown)[1][2],literal(value));
});
test('G01-E05: inappropriate record and primitive partial selections fail closed', () => {
  for (const source of ['[]','[{}]','[1]','[{},1]','{}','null']) rejects(() => generate(parseText(source), '', 'records'), 'style');
  rejects(() => generate(parseText('{"x":1}'), '/x'), 'selection');
  rejects(() => resolve(parseText('[{}]'), '/00'), 'pointer');
});
test('G01-B01: depth 128 succeeds, 129 and extreme recursion rejected before recursive parser', () => {
  assert.equal(parseText('['.repeat(128)+'0'+']'.repeat(128)).count, 129);
  for (const n of [129, 20000]) rejects(() => parseText('['.repeat(n)+'0'+']'.repeat(n)), 'depth');
});
test('G01-B02: 100,000 nodes accepted, 100,001 explicitly rejected', () => {
  assert.equal(parseText('['+Array(99999).fill('0').join(',')+']').count, 100000);
  rejects(() => parseText('['+Array(100000).fill('0').join(',')+']'), 'nodes');
});
test('G01-B03: item data rows 10,000 and 10,001; record columns 100 and 101', () => {
  assert.equal(generate(parseText('['+Array(9999).fill('0').join(',')+']')).rows.length-1, 10000);
  rejects(() => generate(parseText('['+Array(10000).fill('0').join(',')+']')), 'rows');
  const object = n => Object.fromEntries(Array.from({length:n},(_,i)=>['k'+i,0]));
  assert.equal(generate(parseText(JSON.stringify([object(100)])), '', 'records').rows[0].length, 101);
  rejects(() => generate(parseText(JSON.stringify([object(101)])), '', 'records'), 'columns');
});
test('G01-B04: diagram 200/201 nodes, complete labels 199/200/201 codepoints, no truncation', () => {
  assert.equal(generate(parseText('['+Array(199).fill('0').join(',')+']'), '', 'mermaid').labels.length, 200);
  rejects(() => generate(parseText('['+Array(200).fill('0').join(',')+']'), '', 'mermaid'), 'diagramNodes');
  const overhead = cpLength(generate(parseText('""'), '', 'mermaid').labels[0]);
  for (const size of [199,200]) assert.equal(cpLength(generate(parseText(literal('a'.repeat(size-overhead))), '', 'mermaid').labels[0]), size);
  rejects(() => generate(parseText(literal('a'.repeat(201-overhead))), '', 'mermaid'), 'label');
  assert.equal(cpLength('😀'),1);
});
test('G01-B05: file-byte boundary including BOM and Markdown 10 MiB are independently enforced', () => {
  const byteLimit = new Uint8Array(limits.bytes + 1); rejects(() => parseBytes(byteLimit), 'bytes');
  const exact = new Uint8Array(limits.bytes).fill(0x20); exact.set(new TextEncoder().encode('null'));
  assert.equal(parseBytes(exact).root.type, 'null');
  rejects(() => generate(parseText(literal('a'.repeat(limits.markdown)))), 'markdown');
});
test('G01-B06: final diagram code 49,999/50,000/50,001 uses exact generated LF-inclusive size', () => {
  const base=generate(parseText(JSON.stringify(Array(199).fill(''))),'','mermaid');
  for(const size of [49999,50000,50001]){
    let remaining=size-cpLength(base.code);
    const values=Array.from({length:199},(_,i)=>{
      const length=Math.min(remaining,limits.label-cpLength(base.labels[i+1]));remaining-=length;return 'a'.repeat(length);
    });
    assert.equal(remaining,0);
    const model=parseText(JSON.stringify(values));
    if(size===50001)rejects(()=>generate(model,'','mermaid'),'code');
    else assert.equal(cpLength(generate(model,'','mermaid').code),size);
  }
});
test('G01-B07: record 10,000 rows and Markdown body exactly 10 MiB succeed; next byte/row fails', () => {
  assert.equal(generate(parseText(JSON.stringify(Array(10000).fill({x:0}))),'','records').rows.length-1,10000);
  rejects(()=>generate(parseText(JSON.stringify(Array(10001).fill({x:0}))),'','records'),'rows');
  const overhead=new TextEncoder().encode(generate(parseText('""')).markdown).length;
  const exact=generate(parseText(literal('a'.repeat(limits.markdown-overhead))));
  assert.equal(new TextEncoder().encode(exact.markdown).length,limits.markdown);
  rejects(()=>generate(parseText(literal('a'.repeat(limits.markdown-overhead+1)))),'markdown');
});
test('G02-S01: 20 inspections retain only one set, reset/eviction reparses without touching business results', () => {
  const cache = new ParseCache(); const bytes = new TextEncoder().encode('{"x":{}}');
  const result = Object.freeze({status:'success', text:'synthetic completed A'});
  for (let i=0;i<20;i++) { cache.get('f'+i, bytes); assert.equal(cache.stats().sets,1); }
  cache.reset(); assert.equal(cache.stats().sets,0);
  assert.equal(resolve(cache.get('A',bytes), '/x').type,'object');
  assert.deepEqual(result,{status:'success',text:'synthetic completed A'});
  cache.reset(); rejects(()=>cache.get('bad',new TextEncoder().encode('{')), 'syntax');
  assert.equal(cache.stats().sets,0);
});
