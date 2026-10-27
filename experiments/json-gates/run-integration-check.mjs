import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const server=spawn(process.execPath,['integration-build.mjs','--preview'],{cwd,stdio:['ignore','pipe','pipe']});
let stopped=false;server.once('exit',()=>{stopped=true;});server.once('error',()=>{stopped=true;});
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('preview-startup')),30000);
    server.once('error',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
    server.once('exit',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});
    server.stdout.on('data',data=>{if(data.toString().includes('Integration preview port 4190')){clearTimeout(timer);resolve();}});
  });
  for(const script of ['integration-check.mjs','update-check.mjs']){
    const result=spawnSync(process.execPath,[script,...process.argv.slice(2)],{cwd,encoding:'utf8',timeout:300000,env:{...process.env,UPDATE_PROFILE:'integration'}});
    for(const line of (result.stdout??'').split('\n'))if(/^(chrome|edge|chromium) ((IC|IU)-\d+|environment) (PASS|FAIL)/.test(line))console.log(line);
    if(result.status!==0){console.log('Integration verification failed');process.exitCode=1;break;}
  }
}catch{console.log('Integration preview setup failed');process.exitCode=1;}
finally{if(server.pid&&!stopped)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});}
