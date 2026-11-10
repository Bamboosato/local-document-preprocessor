import {build} from 'vite';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const compiled=await build({configFile:false,logLevel:'silent',resolve:{alias:{'decode-named-character-reference':fileURLToPath(new URL('../../node_modules/decode-named-character-reference/index.js',import.meta.url))}},build:{write:false,minify:false,target:'es2022',rollupOptions:{input:'control-worker.mjs',output:{format:'es',inlineDynamicImports:true}}}});
const js=compiled.output.find(item=>item.type==='chunk').code;
const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'");
  if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(js);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
try {
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(()=>new Promise(resolve=>{
    const w=new Worker('/worker.mjs',{type:'module'});
    w.onmessage=e=>{resolve(e.data);w.terminate();};
    w.onerror=()=>{resolve({parse:false,error:'worker-load'});w.terminate();};
  }));
  console.log(JSON.stringify({control:'root-mermaid-12.2.0',...result}));
  if(!result.parse)process.exitCode=1;
}finally{await browser.close();server.close();}
