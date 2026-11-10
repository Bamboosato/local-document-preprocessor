// Candidate-only supplement for helper code already flattened into DOMPurify.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [originalPath,evidencePath]=process.argv.slice(2);if(!originalPath||!evidencePath)throw Error('usage: append-helper-original.mjs ORIGINAL FIXED_HELPER_EVIDENCE');
const helper=JSON.parse(await readFile(evidencePath,'utf8')).helper;
const bytes=await readFile(originalPath),sha=b=>createHash('sha256').update(b).digest('hex');
if(helper.name!=='@babel/helpers'||helper.license!=='MIT'||!/^\d+\.\d+\.\d+$/.test(helper.version)||bytes.length!==helper.originalBytes||sha(bytes)!==helper.originalSha256)throw Error('helper original mismatch');
const root=fileURLToPath(new URL('./dist/licenses/',import.meta.url));
const manifest=JSON.parse(await readFile(root+'manifest.json','utf8')),index=await readFile(root+'index.html','utf8');
if(manifest.items.length!==68||!index.endsWith('</ul></body></html>'))throw Error('unexpected candidate base materials');
const name='original-067-0.txt';if(manifest.items.some(i=>i.path==='/licenses/'+name))throw Error('helper original already present');
const row=`<li><strong>${helper.name} ${helper.version}</strong> (MIT) [DOMPurify内包の生成helper、版は固定release lockによる]: <a href="./${name}">LICENSE</a></li>`;
await writeFile(root+name,bytes,{flag:'wx'});
await writeFile(root+'index.html',index.replace('</ul></body></html>',row+'</ul></body></html>'));
manifest.items.push({path:'/licenses/'+name,name:helper.name,version:helper.version,sourceName:'LICENSE',sha256:sha(bytes),referenceOnly:false,role:'inlined generated helper; version correspondence from fixed DOMPurify release lock'});
await writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
const {writeSw}=await import('./write-sw.mjs');await writeSw(fileURLToPath(new URL('./dist/',import.meta.url)));
console.log(JSON.stringify({helper:helper.name,version:helper.version,originals:manifest.items.length,sha256:sha(bytes)}));
