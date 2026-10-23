import { createServer, build, preview } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export const config={root,configFile:false,plugins:[{name:'prototype-static-manifest',generateBundle(_options,bundle){this.emitFile({type:'asset',fileName:'gate-assets.json',source:JSON.stringify(Object.keys(bundle).filter(name=>/^assets\/[^/]+\.(js|css)$/.test(name)).map(name=>'/'+name))});}}],worker:{format:'iife',rollupOptions:{output:{inlineDynamicImports:true}}},build:{target:'es2022',rollupOptions:{input:{main:root+'index.html',frame:root+'frame.html'}}},resolve:{alias:{'decode-named-character-reference':fileURLToPath(new URL('../../node_modules/decode-named-character-reference/index.js',import.meta.url))}},server:{host:'127.0.0.1',port:4187,strictPort:true,cors:true,fs:{allow:[fileURLToPath(new URL('../../',import.meta.url))]}}};
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--build')) await build(config);
  else if(process.argv.includes('--preview')) {await preview({...config,preview:{host:'127.0.0.1',port:4187,strictPort:true,cors:true}});console.log('JSON gate built harness http://127.0.0.1:4187');}
  else {const server=await createServer(config);await server.listen();console.log('JSON gate harness http://127.0.0.1:4187');}
}
