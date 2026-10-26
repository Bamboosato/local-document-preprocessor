import {build,preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export const readinessCSP="default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const config={root,configFile:false,publicDir:false,worker:{format:'iife',rollupOptions:{output:{inlineDynamicImports:true}}},
  build:{outDir:'dist-readiness',assetsInlineLimit:0,target:'es2022',rollupOptions:{input:root+'readiness.html'}},
  plugins:[{name:'readiness-static-generation',async generateBundle(_options,bundle){
    const names=Object.keys(bundle).sort();
    const hash=createHash('sha256');
    hash.update(readinessCSP);
    const template=await readFile(new URL('./readiness-sw-template.js',import.meta.url),'utf8');
    hash.update(template);
    // Vite emits HTML after this hook; include its source and URL explicitly.
    hash.update(await readFile(new URL('./readiness.html',import.meta.url),'utf8'));
    for(const name of names){const item=bundle[name];hash.update(name);hash.update(item.type==='chunk'?item.code:item.source);}
    const generation=hash.digest('hex').slice(0,16);
    const assets=[...new Set(['/readiness.html',...names.map(name=>'/'+name)])];
    this.emitFile({type:'asset',fileName:'readiness-sw.js',source:template.replace('__GENERATION__',generation).replace('__ASSETS__',JSON.stringify(assets))});
    this.emitFile({type:'asset',fileName:'readiness-assets.json',source:JSON.stringify({generation,assets})});
  }}]};
if(process.argv.includes('--preview')){
  await preview({...config,preview:{host:'127.0.0.1',port:4188,strictPort:true,cors:process.env.READINESS_CORS==='1',headers:{'Content-Security-Policy':readinessCSP,'Cache-Control':'no-store'}}});
  console.log('Readiness preview port 4188');
}else await build(config);
