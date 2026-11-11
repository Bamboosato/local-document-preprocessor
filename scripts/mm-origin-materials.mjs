import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyMmOriginMaterials(project=root){
  const record=JSON.parse(await readFile(new URL('docs/evidence/mm-font-provenance-review.json',root)));
  const published=JSON.parse(await readFile(new URL('docs/evidence/json-published-wasm-correspondence.json',root)));
  const wasm=await readFile(new URL('node_modules/@embedpdf/pdfium/dist/pdfium.wasm',project));
  if(wasm.length!==record.pdfiumWasmBytes||hash(wasm)!==record.pdfiumWasmSha256||!published.packages.some(p=>p.wasmSha256===record.pdfiumWasmSha256))throw Error('MM origin WASM mismatch');
  if(record.firstObservedFileCommit!=='5110c4743751145c4ae1934cd1d83bc6c55bb43f'||record.fonts.length!==2)throw Error('MM origin source mismatch');
  for(const font of record.fonts)if(hash(wasm.subarray(font.wasmOffset,font.wasmOffset+font.bytes))!==font.sha256)throw Error('MM origin data mismatch');
  const files=[];
  for(const item of record.referenceMaterials){
    if(!item.source.startsWith('docs/third-party-wasm-notices/mm-font-origin/')||!item.outputPath.startsWith('mm-font-origin/')||[item.source,item.outputPath].some(p=>p.includes('..')||/[\\:]/.test(p)))throw Error('MM origin unsafe path');
    const bytes=await readFile(new URL(item.source,project));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('MM origin material mismatch');
    files.push({...item,bytes});
  }
  if(files.length!==2||new Set(files.map(f=>f.outputPath)).size!==2)throw Error('MM origin count mismatch');
  return {record,files};
}
export async function copyMmOriginMaterials(output){
  const {record,files}=await verifyMmOriginMaterials();
  for(const f of files){const target=new URL(f.outputPath,output);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,f.bytes);}
  return {scope:'Initial-publication references; not complete outline lineage or MM permission clearance',commit:record.firstObservedFileCommit,originals:files.map(({outputPath,sha256,bytes,label})=>({path:outputPath,sha256,bytes:bytes.length,label}))};
}
