import {it,expect} from 'vitest';
import {boundedTextPreview,jsonTablePagePreview} from './outputPreview';
it('SR-26 selects the requested 100 table rows before parsing, preserving metadata and escaped cell lines',()=>{
  const source='元ファイル: `fixture.json`\n\n| key | value |\n| --- | --- |\n'+Array.from({length:101},(_,i)=>`| ${i} | \\n${i} |\n`).join('');
  const first=jsonTablePagePreview(source,0),last=jsonTablePagePreview(source,1);
  expect(first.excerpt).toBe(false);expect(first.text).not.toContain('| 100 |');expect(last.text).toContain('| 100 | \\n100 |');expect(last.text).not.toContain('| 99 |');expect(last.text).toContain('元ファイル:');
});
it('SR-27 bounds a giant page without parsing or copying the entire cell into the preview',()=>{
  const source='metadata\n\n| key |\n| --- |\n| `'+ 'x'.repeat(1024**2)+'` |\n';
  const preview=jsonTablePagePreview(source,0);expect(preview.excerpt).toBe(true);expect(preview.text.length).toBe(10000);expect(source.length).toBeGreaterThan(1024**2);
});
it.each([51199,51200,51201])('SR-28 bounds UTF-8 preview at %i bytes without changing the source',size=>{
  const source='x'.repeat(size),preview=boundedTextPreview(source);expect(preview.excerpt).toBe(size>51200);expect(preview.text.length).toBe(size>51200?10000:size);expect(source.length).toBe(size);
});
it('SR-29 excerpt counts Unicode codepoints and UTF-8 bytes separately',()=>{
  const source='😀'.repeat(15000),preview=boundedTextPreview(source);expect(preview.excerpt).toBe(true);expect(Array.from(preview.text)).toHaveLength(10000);expect(preview.text.charCodeAt(preview.text.length-1)).toBeGreaterThanOrEqual(0xdc00);
});
