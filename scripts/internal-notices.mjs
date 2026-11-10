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
  const files=[];
  for(const item of record.materials){
    const bytes=await readFile(new URL(item.source,project));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('internal notice material mismatch');
    files.push({...item,bytes});
  }
  return {record,files};
}
