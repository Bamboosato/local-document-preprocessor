import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPakoMaterials(project=root){
  const record=JSON.parse(await readFile(new URL('docs/evidence/pako-1.0.11-notices.json',root)));
  const directory=new URL('node_modules/pako/',project);
  const [pkg,lock]=await Promise.all([readFile(new URL('package.json',directory)),readFile(new URL('package-lock.json',project))]);
  const installed=JSON.parse(pkg),locked=JSON.parse(lock).packages?.['node_modules/pako'];
  if(installed.name!==record.name||installed.version!==record.version||installed.license!==record.declaredLicense||locked?.version!==record.version||locked.integrity!==record.integrity||locked.resolved!==record.tarball)throw Error('pako version/integrity/license mismatch');
  const names=(await readdir(new URL('lib/zlib/',directory))).sort();
  const expected=record.sourceFiles.filter(f=>f.path.startsWith('lib/zlib/')).map(f=>f.path.slice('lib/zlib/'.length)).sort();
  if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('pako source inventory mismatch');
  for(const item of record.sourceFiles){
    const bytes=await readFile(new URL(item.path,directory));
    if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('pako source hash mismatch');
  }
  const bytes=await readFile(new URL(record.noticeSnapshot,project));
  const original=record.sourceFiles.find(f=>f.path===record.noticeSource);
  if(bytes.length!==original.bytes||hash(bytes)!==original.sha256)throw Error('pako notice hash mismatch');
  return {record,bytes,path:record.outputPath,sha256:original.sha256};
}
