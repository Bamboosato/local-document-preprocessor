import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function writeSw(directory=fileURLToPath(new URL('./dist/',import.meta.url))){
const root=path.resolve(directory)+path.sep;
async function files(dir){
  const entries=await readdir(root+dir,{withFileTypes:true});const result=[];
  for(const e of entries){const rel=dir+e.name;if(e.isDirectory())result.push(...await files(rel+'/'));else if(e.isFile())result.push('/'+rel);else throw Error('unexpected asset type');}
  return result;
}
const urls=['/','/tiny.js','/worker.js',...(await files('assets/'))];
try{urls.push(...await files('licenses/'));}catch(error){if(error.code!=='ENOENT')throw error;}
urls.sort();const digest=createHash('sha256');
for(const url of urls){digest.update(url);digest.update(await readFile(root+(url==='/'?'index.html':url.slice(1))));}
const cacheName='tiny-poc-'+digest.digest('hex').slice(0,16);
await writeFile(root+'sw.js',`const urls=${JSON.stringify(urls)};const cacheName=${JSON.stringify(cacheName)};\nself.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(urls))));\nself.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method==='GET'&&u.origin===self.location.origin&&urls.includes(u.pathname))event.respondWith(caches.open(cacheName).then(cache=>cache.match(u.pathname)).then(hit=>hit||fetch(event.request)));});\n`);
console.log(JSON.stringify({cachedAssets:urls.length,licenseAssets:urls.filter(x=>x.startsWith('/licenses/')).length}));
return {urls,cacheName};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await writeSw();
