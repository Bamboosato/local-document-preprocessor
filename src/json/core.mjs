import { createScanner, SyntaxKind as K, parseTree } from 'jsonc-parser';

export const limits = Object.freeze({ bytes: 50 * 1024 ** 2, depth: 128, nodes: 100000, rows: 10000, columns: 100, markdown: 10 * 1024 ** 2, diagramNodes: 200, label: 200, code: 50000 });
export class GateError extends Error {
  constructor(code, offset) { super(code); this.code = code; if (offset !== undefined) this.offset = offset; }
}
const fail = (code, offset) => { throw new GateError(code, offset); };
export const literal = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const encodeSegment = value => value.replace(/~/g, '~0').replace(/\//g, '~1');
export const cpLength = value => Array.from(value).length;
function unicode(value, offset) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('unicode', offset);
    } else if (c >= 0xdc00 && c <= 0xdfff) fail('unicode', offset);
  }
}
// Preflight before the recursive library parser: reject excessive depth/count
// without first allocating a complete tree or entering deeply recursive code.
function preflight(source) {
  const scanner = createScanner(source, true);
  let depth = 0, count = 0, pending;
  const add = d => { if (d > limits.depth) fail('depth'); if (++count > limits.nodes) fail('nodes'); };
  for (let token = scanner.scan(); token !== K.EOF; token = scanner.scan()) {
    if (scanner.getTokenError()) fail('syntax', scanner.getTokenOffset());
    if (pending !== undefined) { if (token !== K.ColonToken) add(pending); pending = undefined; }
    if (token === K.StringLiteral) pending = depth;
    else if (token === K.OpenBraceToken || token === K.OpenBracketToken) { add(depth); depth++; }
    else if (token === K.CloseBraceToken || token === K.CloseBracketToken) depth--;
    else if ([K.NumericLiteral, K.NullKeyword, K.TrueKeyword, K.FalseKeyword].includes(token)) add(depth);
  }
  if (pending !== undefined) add(pending);
}
export function parseBytes(bytes) {
  if (bytes.byteLength > limits.bytes) fail('bytes');
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff)) fail('encoding');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('encoding'); }
  preflight(source);
  const errors = [];
  const root = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (errors.length || !root) fail('syntax', errors[0]?.offset ?? 0);
  const stack = [root]; let count = 0;
  while (stack.length) {
    const node = stack.pop(); count++;
    if (node.type === 'string') unicode(node.value, node.offset);
    if (node.type === 'object') {
      const keys = new Set();
      for (const property of node.children ?? []) {
        const [key, value] = property.children;
        unicode(key.value, key.offset);
        if (keys.has(key.value)) fail('duplicate', key.offset);
        keys.add(key.value); stack.push(value);
      }
    } else if (node.type === 'array') for(const child of node.children??[])stack.push(child);
  }
  return { source, root, count };
}
export const parseText = text => parseBytes(new TextEncoder().encode(text));
export function children(node) {
  if (node.type === 'object') return (node.children ?? []).map(property => ({ key: property.children[0].value, node: property.children[1] }));
  if (node.type === 'array') return (node.children ?? []).map((child, index) => ({ key: String(index), node: child }));
  return [];
}
export function resolve(model, pointer) {
  if (pointer === '') return model.root;
  if (!pointer.startsWith('/')) fail('pointer');
  let node = model.root;
  for (const encoded of pointer.slice(1).split('/')) {
    if (/~(?![01])/u.test(encoded)) fail('pointer');
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node.type === 'array' && !/^(0|[1-9]\d*)$/.test(key)) fail('pointer');
    const match = children(node).find(child => child.key === key);
    if (!match) fail('pointer');
    node = match.node;
  }
  return node;
}
export function* walk(node, pointer = '', key = 'root', parent = null) {
  yield { node, pointer, key, parent };
  for (const child of children(node)) yield* walk(child.node, `${pointer}/${encodeSegment(child.key)}`, child.key, pointer);
}
export function compact(model, node) {
  function* chunks(current) {
    if (current.type === 'number') { if(current.length>limits.markdown)fail('markdown');yield model.source.slice(current.offset,current.offset+current.length); return; }
    if (['object','array'].includes(current.type)) {
      const object=current.type==='object';yield object?'{':'[';let first=true;
      for (const child of children(current)) {
        if(!first)yield ',';first=false;
        if(object){if(child.key.length>limits.markdown)fail('markdown');yield literal(child.key)+':';}
        yield* chunks(child.node);
      }
      yield object?'}':']';return;
    }
    if(current.type==='string'&&current.value.length>limits.markdown)fail('markdown');
    yield literal(current.value);
  }
  let text='',bytes=0;const encoder=new TextEncoder();
  for(const chunk of chunks(node)){bytes+=encoder.encode(chunk).length;if(bytes>limits.markdown)fail('markdown');text+=chunk;}
  return text;
}
export function valueText(model, node) {
  if (node.type === 'object') return `${node.children?.length ?? 0}項目`;
  if (node.type === 'array') return `${node.children?.length ?? 0}件`;
  return compact(model, node);
}
// GFM autolinks are constructed after entity decoding, so entity escaping alone
// cannot keep URLs as data. A dynamically sized code span protects exact text;
// GFM table pipes still need escaping even inside code spans.
export const markdownText = value => {
  const content=String(value);let longest=0;
  for(const run of content.matchAll(/`+/g))longest=Math.max(longest,run[0].length);
  const fence='`'.repeat(longest+1);
  const pad=content.startsWith('`')||content.endsWith('`')||(/^ .* $/u.test(content))?' ':'';
  return fence+pad+content.replace(/\|/g,'\\|')+pad+fence;
};
const table = rows => {
  const lines=[];let bytes=0;const encoder=new TextEncoder();
  const append=line=>{bytes+=encoder.encode(line).length+(lines.length?1:0);if(bytes>limits.markdown)fail('markdown');lines.push(line);};
  append('| '+rows[0].map(markdownText).join(' | ')+' |');
  append('| '+rows[0].map(()=>'---').join(' | ')+' |');
  for(const row of rows.slice(1))append('| '+row.map(markdownText).join(' | ')+' |');
  return lines.join('\n');
};
// Keep ordinary labels (including original numeric tokens) readable in source;
// grammar punctuation enters only as Mermaid numeric entities inside quotes.
export const diagramText = value => value.replace(/[^\p{L}\p{N} ,._:+\-/]/gu, ch => `#${ch.codePointAt(0)};`);
// Metadata labels accept YAML-quoted text without Mermaid's entity roundtrip.
// Data string whitespace/HTML/brace characters use reversible JSON escapes;
// this also avoids HTML sanitization changing the original JSON value.
export const diagramLiteral = value => '"'+Array.from(value,ch=>{
  const cp=ch.codePointAt(0);
  // Avoid a renderer treating JSON's backslash-n as a layout line break.
  // Escaping the original codepoint (not an already serialized escape) keeps
  // JSON.parse(labelLiteral) exactly equal to the original string.
  if(cp<32||/[ <>&{}'"\\]/u.test(ch)||[0x2028,0x2029,0xfffe,0xffff].includes(cp))return '\\u'+cp.toString(16).padStart(4,'0');
  return ch;
}).join('')+'"';
export function generate(model, pointer = '', style = 'items', fileName = 'fixture.json') {
  const selected = resolve(model, pointer);
  if (pointer !== '' && !['object', 'array'].includes(selected.type)) fail('selection');
  if(pointer.length>limits.markdown||fileName.length>limits.markdown)fail('markdown');
  const header = `元ファイル: ${markdownText(literal(fileName))}\n\n変換対象: ${markdownText(literal(pointer))}${pointer === '' ? ' ファイル全体（ルート）' : ''}\n\n出力スタイル: ${style}\n\n`;
  let body, rows, code, labels, graph;
  if (style === 'items') {
    rows = [['パス', '型', '値']];
    for (const { node, pointer: path } of walk(selected, pointer)) {
      if (rows.length > limits.rows) fail('rows');
      if(path.length>limits.markdown)fail('markdown');
      rows.push([literal(path), node.type, valueText(model, node)]);
    }
    body = table(rows);
  } else if (style === 'records') {
    const records = children(selected);
    if (selected.type !== 'array' || !records.length || records.some(c => c.node.type !== 'object' || !c.node.children?.length)) fail('style');
    if (records.length > limits.rows) fail('rows');
    const keys = [...new Set(records.flatMap(c => children(c.node).map(x => x.key)))];
    if (keys.length > limits.columns) fail('columns');
    if(keys.some(key=>key.length>limits.markdown))fail('markdown');
    rows = [['配列位置', ...keys.map(literal)], ...records.map((record, i) => {
      const map = new Map(children(record.node).map(c => [c.key, c.node]));
      return [String(i), ...keys.map(key => map.has(key) ? compact(model, map.get(key)) : '（項目なし）')];
    })];
    body = table(rows);
  } else if (style === 'mermaid') {
    const nodes=[];
    for(const entry of walk(selected,pointer)){
      if(nodes.length===limits.diagramNodes)fail('diagramNodes');
      nodes.push(entry);
    }
    if(nodes.some(entry=>entry.key.length>limits.label*2||(entry.node.type==='string'&&entry.node.value.length>limits.label*2)||(entry.node.type==='number'&&entry.node.length>limits.label)))fail('label');
    labels = nodes.map(({ node, key }) => `${diagramLiteral(key)}｜${node.type}｜${node.type==='string'?diagramLiteral(node.value):valueText(model, node)}`);
    if (labels.some(label => cpLength(label) > limits.label)) fail('label');
    const ids = new Map(nodes.map((n, i) => [n.pointer, `n${i}`]));
    graph = {labels, parents:nodes.map(n=>n.parent===null?-1:Number(ids.get(n.parent).slice(1)))};
    code = 'flowchart TD\n' + nodes.map((n, i) => `n${i}@{ shape: rect, labelType: text, label: '${labels[i].replace(/'/g,"''")}' }\n${n.parent === null ? '' : `${ids.get(n.parent)} --> n${i}\n`}`).join('');
    if (cpLength(code) > limits.code) fail('code');
    body = '```mermaid\n' + code + '```';
  } else fail('style');
  const markdown = header + body + '\n';
  if (new TextEncoder().encode(markdown).length > limits.markdown) fail('markdown');
  return { markdown, rows, code, labels, graph };
}

// Deliberately one complete parse set. Business state/results live outside it.
export class ParseCache {
  constructor() { this.current = undefined; this.epoch = 0; this.parses = 0; }
  get(id, bytes) {
    if (this.current?.id !== id) {
      this.current = undefined;
      const model = parseBytes(bytes); this.parses++;
      this.current = { id, model, epoch: this.epoch };
    }
    return this.current.model;
  }
  reset() { this.current = undefined; this.epoch++; }
  stats() { return { sets: this.current ? 1 : 0, epoch: this.epoch, parses: this.parses }; }
}
