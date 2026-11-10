import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyWasmDataMaterials(project=root){
  const record=JSON.parse(await readFile(new URL('docs/evidence/wasm-data-notice-materials.json',root)));
  const evidence=JSON.parse(await readFile(new URL('docs/evidence/wasm-data-inclusion-review.json',root)));
  const published=JSON.parse(await readFile(new URL('docs/evidence/json-published-wasm-correspondence.json',root)));
  for(const [key,path,blobs] of [
    ['anydoc','node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm',[...evidence.cmapSource.blobs,evidence.cmapSource.license]],
    ['pdfium','node_modules/@embedpdf/pdfium/dist/pdfium.wasm',evidence.fontBlobs],
  ]){
    const bytes=await readFile(new URL(path,project)),expected=evidence[key];
    if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256||!published.packages.some(p=>p.wasmSha256===expected.sha256&&p.wasmBytes===expected.bytes))throw Error('WASM data binary mismatch');
    for(const blob of blobs){
      const offset=blob.wasmOffset,size=blob.fontBytes??blob.bytes,digest=blob.fontSha256??blob.sha256;
      if(offset<0)continue;
      if(!expected.dataRanges.some(r=>r.fileOffset<=offset&&offset+size<=r.fileOffset+r.bytes)||hash(bytes.subarray(offset,offset+size))!==digest)throw Error('WASM data blob mismatch');
    }
    if(key==='anydoc'){
      const ranges=expected.dataRanges.filter(r=>r.memoryOffset!==null);
      if(ranges.some(r=>r.memoryIndex!==0||r.memoryOffset<0||r.memoryOffset+r.bytes>32*1024*1024))throw Error('WASM data memory range mismatch');
      const memory=Buffer.alloc(Math.max(0,...ranges.map(r=>r.memoryOffset+r.bytes)));
      for(const r of ranges)bytes.copy(memory,r.memoryOffset,r.fileOffset,r.fileOffset+r.bytes);
      const blob=evidence.cmapSource.fragmentedBlob;
      if(hash(memory.subarray(blob.memoryOffset,blob.memoryOffset+blob.bytes))!==blob.sha256)throw Error('WASM split data blob mismatch');
    }
  }
  const files=[];
  for(const item of record.artifacts){
    if(!item.source.startsWith('docs/third-party-wasm-notices/confirmed-data/')||!item.outputPath.startsWith('wasm-data/')||[item.source,item.outputPath].some(p=>p.includes('..')||/[\\:]/.test(p)))throw Error('WASM data notice unsafe path');
    const bytes=await readFile(new URL(item.source,project));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('WASM data notice hash mismatch');
    files.push({...item,bytes});
  }
  if(files.length!==2||new Set(files.map(f=>f.outputPath)).size!==2)throw Error('WASM data notice count mismatch');
  return {record,files};
}
export async function copyWasmDataMaterials(output){
  const {files}=await verifyWasmDataMaterials();
  for(const f of files){const target=new URL(f.outputPath,output);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,f.bytes);}
  return {scope:'Confirmed data bytes only; not a complete WASM SBOM or release approval',originals:files.map(({outputPath,sha256,bytes,label})=>({path:outputPath,sha256,bytes:bytes.length,label}))};
}
