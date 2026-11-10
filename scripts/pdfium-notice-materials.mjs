import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPdfiumNoticeMaterials(project=root){
  const record=JSON.parse(await readFile(new URL('docs/evidence/pdfium-notice-materials.json',root)));
  const legacy=JSON.parse(await readFile(new URL('docs/evidence/json-pdfium-source-licenses.json',root)));
  const lock=JSON.parse(await readFile(new URL('package-lock.json',project))),entry=lock.packages?.['node_modules/'+record.wrapper];
  const pkg=JSON.parse(await readFile(new URL('node_modules/'+record.wrapper+'/package.json',project)));
  if(entry?.version!==record.wrapperVersion||entry.integrity!==record.wrapperIntegrity||pkg.version!==record.wrapperVersion||pkg.name!==record.wrapper)throw Error('PDFium notice wrapper mismatch');
  if(legacy.commit!==record.pdfiumSourceCommit||record.sourceTreeTruncated!==false||legacy.sources.find(s=>s.url.endsWith('/DEPS'))?.sha256!==record.depsSha256)throw Error('PDFium notice source mismatch');
  const originals=record.groups.flatMap(group=>group.files),items=[...originals,record.credits];
  if(originals.length!==record.originalCount||items.length!==record.artifactCount||new Set(items.map(f=>f.outputPath)).size!==items.length)throw Error('PDFium notice count mismatch');
  const files=[];
  for(const item of items){
    if(!item.source.startsWith('docs/third-party-wasm-notices/pdfium/')||!item.outputPath.startsWith('pdfium-candidates/')||[item.source,item.outputPath].some(p=>p.includes('..')||/[\\:]/.test(p)))throw Error('PDFium notice unsafe path');
    if(item.legacyReviewPath&&!legacy.originals.some(o=>o.reviewPath===item.legacyReviewPath&&o.sha256===item.sha256&&o.bytes===item.bytes))throw Error('PDFium legacy original mismatch');
    const bytes=await readFile(new URL(item.source,project));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('PDFium notice hash mismatch');
    files.push({...item,bytes});
  }
  return {record,files};
}
export async function copyPdfiumNoticeMaterials(output){
  const {record,files}=await verifyPdfiumNoticeMaterials();
  for(const item of files){const target=new URL(item.outputPath,output);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,item.bytes);}
  return {sourceCommit:record.pdfiumSourceCommit,scope:record.scope,groups:record.groups.map(group=>({name:group.name,revision:group.revision,depsCondition:group.depsCondition,originals:group.files.map(({outputPath,sha256,bytes})=>({path:outputPath,sha256,bytes}))})),credits:{path:record.credits.outputPath,sha256:record.credits.sha256,bytes:record.credits.bytes}};
}
