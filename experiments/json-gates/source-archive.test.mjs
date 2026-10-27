import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readTar,readTarGzip,licenseEntries,targetCandidates,safeArchivePath} from './source-archive.mjs';
function member(name,text,type='0'){
  const data=Buffer.from(text),header=Buffer.alloc(512);header.write(name,0,100);header.write(data.length.toString(8).padStart(11,'0')+'\0',124,12);header.fill(32,148,156);header.write(type,156);header.write('ustar',257);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8);return Buffer.concat([header,data,Buffer.alloc((512-data.length%512)%512)]);
}
const archive=(...members)=>Buffer.concat([...members,Buffer.alloc(1024)]);
test('SL-01: original notice bytes and nested license directories survive collection',()=>{
  const bytes=archive(member('fixture/LICENSE-MIT','original\r\n'),member('fixture/licenses/NOTICE.txt','notice'),member('fixture/src/lib.rs','code'));
  const entries=readTarGzip(gzipSync(bytes));assert.equal(entries.length,3);
  const notices=licenseEntries(entries);assert.equal(notices.length,2);assert.equal(notices[0].bytes.toString(),'original\r\n');
  assert.equal(licenseEntries([{name:'README.md',bytes:Buffer.from('license')}],'README.md').length,1);
});
test('SL-02: PAX and GNU long names resolve to the exact safe original path',()=>{
  const name='fixture/licenses/'+('long-'.repeat(25))+'MIT.txt';let record=' path='+name+'\n';let length=record.length+2;while((String(length)+record).length!==length)length=(String(length)+record).length;record=String(length)+record;
  const p=readTar(archive(member('pax',record,'x'),member('short','text')));assert.equal(p[0].name,name);
  const gnu=readTar(archive(member('long',name+'\0','L'),member('short','text')));assert.equal(gnu[0].name,name);
});
test('SL-03: parent, absolute, URL-normalized paths and archive links are rejected before filesystem writes',()=>{
  for(const name of ['../out','/absolute','C:/out','a\\b','a/%2e%2e/b','a?b','a#b','.. /out','a./out','AUX.txt','dir/NUL'])assert.throws(()=>safeArchivePath(name),/unsafe-archive-path/);
  assert.throws(()=>readTar(archive(member('../out','text'))),/unsafe-archive-path/);
  assert.throws(()=>readTar(archive(member('link','target','2'))),/unsupported-archive-entry/);
});
test('SL-04: corrupt, truncated, duplicate and empty archives cannot count as successful originals',()=>{
  const bytes=archive(member('fixture/LICENSE','text')),bad=Buffer.from(bytes);bad[0]^=1;
  assert.throws(()=>readTar(bad),/tar-checksum-mismatch/);
  assert.throws(()=>readTar(bytes.subarray(0,515)),/truncated-or-large-tar/);
  assert.throws(()=>readTar(archive(member('same','a'),member('same','b'))),/duplicate-archive-entry/);
  assert.throws(()=>readTar(Buffer.alloc(1024)),/incomplete-archive/);
});
test('SL-05: target graph remains a subset of fixed registry candidates and merges repeated feature contexts',()=>{
  const records=[{name:'fixture',version:'1.0.0',checksum:'a'.repeat(64)}];
  const result=targetCandidates('anydoc-wasm v0.1.7 (/audit/source)|\nfixture v1.0.0|a\nfixture v1.0.0|b (*)',records);
  assert.equal(result.length,1);assert.deepEqual(result[0].features,['a','b']);
  assert.throws(()=>targetCandidates('unknown v1.0.0|',records),/target-not-in-fixed-lock/);
  assert.throws(()=>targetCandidates('anydoc-wasm v0.1.8 (/audit/source)|',records),/workspace-version-mismatch/);
  assert.throws(()=>targetCandidates('',records),/empty-target-graph/);
});
