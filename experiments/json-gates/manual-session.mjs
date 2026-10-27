import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {parseText,generate} from './core.mjs';
import {chromium} from './browser-runtime.mjs';

// User-run preparation only: this does not record a manual acceptance verdict.
const args=process.argv.slice(2),describe=args.includes('--describe');
const engine=args.find(a=>['chrome','edge'].includes(a))??'chrome';
const scenario=args.find(a=>['ready','invalid','display-failure','empty'].includes(a))??'ready';
if(args.some(a=>!['chrome','edge','ready','invalid','display-failure','empty','--describe'].includes(a))||args.filter(a=>['chrome','edge'].includes(a)).length>1||args.filter(a=>['ready','invalid','display-failure','empty'].includes(a)).length>1){console.log('manual-session unsupported option');process.exit(1);}
const fixture=generate(parseText(JSON.stringify(Array.from({length:199},(_,i)=>`合成-${i+1}-日本語😀`))),'','mermaid');
if(describe){
  console.log(JSON.stringify({purpose:'fixture preparation only; manual results remain NOT_RUN',engine,scenario,fixtureId:'WR-'+scenario.toUpperCase(),nodes:scenario==='empty'?0:fixture.graph.labels.length,edges:scenario==='empty'?0:fixture.graph.parents.filter(p=>p>=0).length,origin:'http://127.0.0.1:4190',browserProfile:'new temporary context',PWAInstallation:'not-supported-by-current-package'},null,2));
}else{
  const cwd=fileURLToPath(new URL('.',import.meta.url));
  let server,browser,stopped=false,resolveExit,stage='build-manifest';
  const exit=new Promise(resolve=>{resolveExit=resolve;});
  process.once('SIGINT',resolveExit);process.once('SIGTERM',resolveExit);
  try{
    const manifest=JSON.parse(await readFile(new URL('./dist-integration/integration-assets.json',import.meta.url),'utf8'));
    stage='preview-startup';
    server=spawn(process.execPath,['integration-build.mjs','--preview'],{cwd,stdio:['ignore','pipe','pipe']});
    server.once('exit',()=>{stopped=true;resolveExit();});server.once('error',()=>{stopped=true;resolveExit();});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('preview-startup')),30000);
      server.once('error',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
      server.once('exit',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
      server.stdout.on('data',data=>{if(data.toString().includes('Integration preview port 4190')){clearTimeout(timer);resolve();}});
      server.stderr.resume();
    });
    stage='browser-launch';browser=await chromium.launch({channel:engine==='edge'?'msedge':'chrome',headless:false});browser.once('disconnected',resolveExit);
    const context=await browser.newContext({viewport:null});context.setDefaultTimeout(25000);
    stage='fixture-preparation';const page=await context.newPage();await page.goto('http://127.0.0.1:4190/readiness.html');await page.waitForFunction(()=>!!window.integration);
    if(scenario!=='empty')await page.evaluate(async({fixture,scenario})=>{
      if(scenario==='invalid')await integration.view.diagram.show({...fixture,code:'invalid diagram'});
      else await integration.view.diagram.show(fixture,scenario==='display-failure'?{blockMilliseconds:6500}:{});
    },{fixture,scenario});
    const expected={ready:'rendered',invalid:'validation-failed','display-failure':'render-timeout',empty:'idle'}[scenario];
    await page.waitForFunction(expected=>integration.view.diagram.state().status===expected,expected);
    if(scenario==='display-failure')await page.evaluate(()=>integration.view.diagram.setMode({}));
    console.log(JSON.stringify({prepared:true,manualVerdict:'NOT_RUN',engine,scenario,generation:manifest.generation,fixtureId:'WR-'+scenario.toUpperCase()}));
    console.log('Complete the manual record separately. Close this dedicated browser or press Ctrl+C to stop. PWA installation is not provided.');
    await exit;
  }catch(error){console.log('manual-session setup failed stage='+stage+' type='+error.name);process.exitCode=1;}
  finally{await browser?.close().catch(()=>{});if(server?.pid&&!stopped)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});}
}
