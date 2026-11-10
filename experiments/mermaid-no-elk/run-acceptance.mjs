import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [upstream,output]=process.argv.slice(2);if(!upstream||!output)throw Error('usage: node run-acceptance.mjs UPSTREAM_ROOT OUTPUT');
const root=fileURLToPath(new URL('.',import.meta.url)),exec=promisify(execFile),results=[];
const files=['index.html','main.mjs','worker.js','build.mjs','write-sw.mjs','poc-server.mjs','check.mjs','ui-safety-check.mjs','different-generation-check.mjs','licenses-check.mjs','offline-check.mjs','prepare-license-candidates.mjs','run-acceptance.mjs'];
const sourceHashes={};for(const name of files)sourceHashes[name]=createHash('sha256').update(await readFile(root+name)).digest('hex');
const steps=[['build.mjs','--materials='+upstream],['prepare-license-candidates.mjs',upstream],['check.mjs'],['ui-safety-check.mjs'],['different-generation-check.mjs'],['licenses-check.mjs'],['offline-check.mjs']];
if(process.env.POC_HELPER_ORIGINAL){
  if(!process.env.POC_HELPER_EVIDENCE||process.env.POC_EXPECTED_ORIGINALS!=='69')throw Error('helper evidence and expected 69 originals are required');
  steps.splice(2,0,['append-helper-original.mjs',process.env.POC_HELPER_ORIGINAL,process.env.POC_HELPER_EVIDENCE]);
  sourceHashes['append-helper-original.mjs']=createHash('sha256').update(await readFile(root+'append-helper-original.mjs')).digest('hex');
}
for(const args of steps){
  try{
    const {stdout,stderr}=await exec(process.execPath,args,{cwd:root,timeout:120000,maxBuffer:4*1024*1024});
    const records=stdout.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    results.push({command:args[0],passed:true,records,warning:stderr.includes("can't be bundled")?'Tiny IIFE is copied explicitly after the Vite build':undefined});
    console.log(JSON.stringify({command:args[0],passed:true}));
  }catch(error){results.push({command:args[0],passed:false,error:'child failed or timed out',exitCode:error.code});console.log(JSON.stringify({command:args[0],passed:false}));break;}
}
const passed=results.length===steps.length&&results.every(r=>r.passed);
await writeFile(output,JSON.stringify({node:process.version,platform:process.platform,sourceHashes,results,passed,scope:'Isolated PoC targeted acceptance. Clipboard is a test double; OS clipboard, physical devices, external distribution and actual product integration are unverified.'},null,2)+'\n',{flag:'wx'});
if(!passed)process.exitCode=1;
