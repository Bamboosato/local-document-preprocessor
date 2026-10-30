import {build,preview} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
// Mermaid emits local style blocks/attributes; this prototype records that cost.
// No script/eval/remote/iframe allowance. Production CSP remains unchanged.
export const standardCSP="default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const config={root,configFile:false,publicDir:false,worker:{format:'iife',rollupOptions:{output:{inlineDynamicImports:true}}},build:{outDir:'dist-standard',assetsInlineLimit:0,target:'es2022',rollupOptions:{input:root+'standard.html'}},resolve:{alias:{'decode-named-character-reference':fileURLToPath(new URL('../../node_modules/decode-named-character-reference/index.js',import.meta.url))}}};
if(process.argv.includes('--preview')){await preview({...config,preview:{host:'127.0.0.1',port:4194,strictPort:true,headers:{'Content-Security-Policy':standardCSP,'Cache-Control':'no-store'}}});console.log('Standard preview port 4194');}
else await build(config);
