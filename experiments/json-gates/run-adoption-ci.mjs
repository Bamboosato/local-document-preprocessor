import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const server=spawn(process.execPath,['readiness-build.mjs','--preview'],{cwd,stdio:['ignore','pipe','pipe']});
let stopped=false;server.once('exit',()=>{stopped=true;});server.once('error',()=>{stopped=true;});
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('preview-startup')),30000);
    server.once('error',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
    server.once('exit',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
    server.stdout.on('data',data=>{if(data.toString().includes('Readiness preview port 4188')){clearTimeout(timer);resolve();}});
  });
  for(const script of ['adoption-check.mjs','update-check.mjs']){
    const result=spawnSync(process.execPath,[script,'chromium'],{cwd,encoding:'utf8',timeout:180000});
    for(const line of (result.stdout??'').split('\n'))if(/^chromium (AD|UP)-\d+ (PASS|FAIL)/.test(line))console.log(line);
    if(result.status!==0){console.log('Prototype browser verification failed');process.exitCode=1;break;}
  }
}catch{console.log('Prototype preview setup failed');process.exitCode=1;}
finally{
  if(server.pid&&!stopped)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
}
