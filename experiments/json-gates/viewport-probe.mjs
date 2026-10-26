import {chromium,firefox,playwrightVersion} from './browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
for(const name of ['chrome','firefox']){
  const browser=name==='chrome'?await chromium.launch({channel:'chrome'}):await firefox.launch();
  const checks=[];
  async function check(id,fn){
    let timer;const start=performance.now();
    try{const data=await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('probe-deadline')),10000);})]);checks.push({id,status:'pass',milliseconds:performance.now()-start,data});console.log(`${name} ${id} PASS`);}
    catch(error){checks.push({id,status:'fail',errorType:error.name,milliseconds:performance.now()-start});process.exitCode=1;console.log(`${name} ${id} FAIL`);}
    finally{clearTimeout(timer);}
  }
  try{
    const resize=await browser.newContext({viewport:{width:1280,height:900}}),page=await resize.newPage();await page.setContent('<!doctype html><title>Viewport fixture</title><p>Fixture</p>');
    await check('ENV-resize',async()=>{await page.setViewportSize({width:320,height:700});return page.evaluate(()=>({width:innerWidth,height:innerHeight}));});await resize.close();
    await check('ENV-initial-narrow',async()=>{const c=await browser.newContext({viewport:{width:320,height:700}});try{const p=await c.newPage();await p.setContent('<!doctype html><title>Viewport fixture</title><p>Fixture</p>');return await p.evaluate(()=>({width:innerWidth,height:innerHeight}));}finally{await c.close();}});
  }finally{await writeFile(new URL(`./evidence/viewport-${name}.json`,import.meta.url),JSON.stringify({engine:name,version:browser.version(),playwrightVersion,checks},null,2));await browser.close();}
}
