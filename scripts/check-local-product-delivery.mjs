import {preview} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {generationBaseline,verifyDelivery} from './local-delivery-check.mjs';
const output=process.argv[2];if(!output)throw Error('usage: node scripts/check-local-product-delivery.mjs NEW_OUTPUT_JSON');
const manifestBytes=await readFile(new URL('../dist/pwa-manifest.json',import.meta.url));
const workerBytes=await readFile(new URL('../dist/sw.js',import.meta.url));
const baseline=generationBaseline(manifestBytes,workerBytes);
const server=await preview({preview:{host:'127.0.0.1',port:0,open:false}});
try{
  const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('preview address');
  const result=await verifyDelivery(`http://127.0.0.1:${address.port}/`,baseline);
  await writeFile(output,JSON.stringify({generation:baseline.id,...result,scope:'Loopback HTTP rehearsal of body hashes, size and selected MIME types. Not deployed delivery or physical-device acceptance.'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({assets:result.count,failures:result.failures.length}));
  if(result.failures.length)process.exitCode=1;
}finally{server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
