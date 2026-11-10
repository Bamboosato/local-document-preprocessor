import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyInternalNotices(project=root){
  const record=JSON.parse(await readFile(new URL('docs/evidence/pdf-lib-1.17.1-notices.json',root)));
  const directory=new URL('node_modules/pdf-lib/',project);
  const pkg=JSON.parse(await readFile(new URL('package.json',directory)));
  const lock=JSON.parse(await readFile(new URL('package-lock.json',project))),locked=lock.packages?.['node_modules/pdf-lib'];
  if(pkg.name!==record.name||pkg.version!==record.version||locked?.version!==record.version||locked.integrity!==record.integrity||locked.resolved!==record.tarball)throw Error('internal notice version/integrity mismatch');
  for(const item of record.sourceFiles){
    const bytes=await readFile(new URL(item.path,directory));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('internal notice source mismatch');
  }
  const borrowed=JSON.parse(await readFile(new URL('docs/evidence/'+record.borrowedLicenseReview,root)));
  for(const item of borrowed.materials){
    if(!record.materials.some(file=>file.source===item.source&&file.sha256===item.sha256&&file.role===item.role))throw Error('borrowed material binding mismatch');
  }
  const fixed=borrowed.materials.find(file=>file.outputPath.endsWith('/PDFKIT-MIT.txt'));
  if(new Set(borrowed.pdfkit.originals.map(item=>item.commit)).size!==5||!borrowed.pdfkit.originals.every(item=>item.sha256===fixed.sha256))throw Error('fixed pdfkit original mismatch');
  for(const reference of borrowed.pdfkit.references){
    const text=await readFile(new URL(reference.pdfLibPath,directory),'utf8');
    if(!text.includes(`https://github.com/${reference.repository}/blob/${reference.commit}/${reference.path}`))throw Error('borrowed source reference mismatch');
  }
  const files=[];
  for(const item of record.materials){
    const bytes=await readFile(new URL(item.source,project));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('internal notice material mismatch');
    files.push({...item,bytes});
  }
  return {record,files};
}
