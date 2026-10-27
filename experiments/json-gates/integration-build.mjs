import {build,preview} from 'vite';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {integrationCSP} from './integration-policy.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const project=fileURLToPath(new URL('../../',import.meta.url));
const modules=new Set();
const capture=()=>({name:'isolated-module-provenance',generateBundle(_options,bundle){
  for(const item of Object.values(bundle))if(item.type==='chunk')for(const id of Object.keys(item.modules))if(id.includes('node_modules')&&!id.startsWith('\0'))modules.add(id.split('?')[0]);
}});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(){
  const packages=new Map(),assets=[];
  // Vite's new-URL asset transform can emit this WASM without a chunk module entry.
  modules.add(fileURLToPath(new URL('../../node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm',import.meta.url)));
  const locks={root:JSON.parse(await readFile(path.join(project,'package-lock.json'),'utf8')),prototype:JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'))};
  for(const id of [...modules].sort()){
    let directory=path.dirname(id),pkg;
    while(directory!==path.dirname(directory)){
      try{const candidate=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));if(candidate.name&&candidate.version){pkg=candidate;break;}}catch{}
      directory=path.dirname(directory);
    }
    if(!pkg?.name||!pkg.version)throw new Error('unidentified-bundled-package');
    const origin=path.relative(root,directory).startsWith('node_modules'+path.sep)?'prototype':'root';
    const lockRoot=origin==='prototype'?root:project;
    const lockPath=path.relative(lockRoot,directory).replaceAll('\\','/');
    const lock=locks[origin];
    const meta=lock.packages[lockPath];
    if(!meta?.resolved||!meta.integrity||meta.version!==pkg.version)throw new Error('bundle-lock-mismatch:'+pkg.name+'@'+pkg.version+':'+origin+':'+(meta?.version??'not-in-lock'));
    const key=origin+':'+lockPath;
    let entry=packages.get(key);
    if(!entry){
      const names=(await readdir(directory,{withFileTypes:true})).filter(e=>e.isFile()&&/^(licen[sc]e|copying|notice|copyright)(\.|$)/i.test(e.name)).map(e=>e.name).sort();
      if(!names.length)throw new Error('bundled-license-evidence-missing:'+pkg.name);
      const notices=[];
      for(const name of names){
        const fileName=`licenses/${origin}/${pkg.name.replaceAll('/','__')}@${pkg.version}/${name}`;
        const source=await readFile(path.join(directory,name));if(!source.length)throw new Error('empty-license');
        assets.push({type:'asset',fileName,source});notices.push(fileName);
      }
      entry={origin,name:pkg.name,version:pkg.version,license:pkg.license??meta.license??null,lockPath,sourcePackage:meta.resolved,integrity:meta.integrity,repository:pkg.repository??null,notices,modules:[]};packages.set(key,entry);
    }
    entry.modules.push({file:path.relative(directory,id).replaceAll('\\','/'),sha256:digest(await readFile(id))});
  }
  assets.push({type:'asset',fileName:'licenses/bundled.json',source:JSON.stringify({scope:'conservative Rollup chunk modules, including tree-shaken entries; not a complete embedded-WASM source inventory',packages:[...packages.values()]},null,2)});
  return assets;
}
const config={root,configFile:false,publicDir:false,resolve:{alias:{'decode-named-character-reference':fileURLToPath(new URL('../../node_modules/decode-named-character-reference/index.js',import.meta.url))}},
  worker:{format:'iife',plugins:()=>[capture()],rollupOptions:{output:{inlineDynamicImports:true}}},
  build:{outDir:'dist-integration',assetsInlineLimit:0,target:'es2022',rollupOptions:{input:root+'readiness.html'}},
  plugins:[capture(),{name:'isolated-integration-build',transformIndexHtml:{order:'pre',handler:html=>html.replace('/readiness.mjs','/integration-runtime.mjs').replaceAll('JSON 静的Worker検証専用','JSON・WASM共存検証専用')},async generateBundle(){
    for(const asset of await inventory())this.emitFile(asset);
  },async writeBundle(){
    const output=path.join(root,'dist-integration');
    const files=(await readdir(output,{recursive:true})).map(p=>p.replaceAll('\\','/')).filter(p=>p==='readiness.html'||p.startsWith('assets/')&&/\.(js|css|svg|wasm)$/.test(p)).sort();
    const runtime=await Promise.all(files.map(async name=>({url:'/'+name,sha256:digest(await readFile(path.join(output,name)))})));
    const template=(await readFile(new URL('./readiness-sw-template.js',import.meta.url),'utf8')).replaceAll('json-readiness-','json-integration-');
    const generation=digest(integrationCSP+template+JSON.stringify(runtime)).slice(0,16);
    await writeFile(path.join(output,'integration-sw.js'),template.replace('__GENERATION__',generation).replace('__ASSETS__',JSON.stringify(runtime.map(x=>x.url))));
    await writeFile(path.join(output,'integration-assets.json'),JSON.stringify({generation,csp:integrationCSP,runtime},null,2));
  }}]};
if(process.argv.includes('--preview')){
  await preview({...config,preview:{host:'127.0.0.1',port:4190,strictPort:true,cors:false,headers:{'Content-Security-Policy':integrationCSP,'Cache-Control':'no-store'}}});
  console.log('Integration preview port 4190');
}else await build(config);
