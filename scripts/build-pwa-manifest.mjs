import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildPwaManifest(directory=resolve(root,'dist')){
  const template=await readFile(resolve(root,'public/sw.js'),'utf8');
  const indexPath=resolve(directory,'index.html');
  let html=(await readFile(indexPath,'utf8')).replace(/<meta name="ldp-generation" content="[a-f0-9]+">\n?/g,'');
  await writeFile(indexPath,html);
  const files=[];
  async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){const full=resolve(path,entry.name);if(entry.isDirectory())await visit(full);else files.push(full);}}
  await visit(directory);
  const assets=[];
  for(const path of files.sort()){
    const name=relative(directory,path).split(sep).join('/');
    if(name==='sw.js'||name==='pwa-manifest.json')continue;
    if(!/^(assets\/|licenses\/|index\.html$|manifest\.webmanifest$|ldp_icon(?:-\d+)?\.png$)/.test(name))throw new Error('unclassified-distribution-file');
    const bytes=await readFile(path);
    assets.push({url:'/'+name.split('/').map(encodeURIComponent).join('/'),sha256:sha(bytes),bytes:bytes.length});
  }
  const id=sha(template+JSON.stringify(assets)).slice(0,24);
  html=html.replace('</head>',`<meta name="ldp-generation" content="${id}">\n</head>`);
  await writeFile(indexPath,html);
  const index=assets.find(asset=>asset.url==='/index.html');index.sha256=sha(html);index.bytes=Buffer.byteLength(html);
  const manifest={schema:1,id,assets};
  await writeFile(resolve(directory,'pwa-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const manifestBytes=await readFile(resolve(directory,'pwa-manifest.json'));
  const embedded={...manifest,assets:[...assets,{url:'/pwa-manifest.json',sha256:sha(manifestBytes),bytes:manifestBytes.length}]};
  await writeFile(resolve(directory,'sw.js'),'self.__LDP_BUILD__='+JSON.stringify(embedded)+';\n'+template);
  return embedded;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const m=await buildPwaManifest();console.log(`PWA manifest: ${m.assets.length} static assets, ${m.assets.reduce((n,a)=>n+a.bytes,0)} bytes, generation ${m.id}`);}
