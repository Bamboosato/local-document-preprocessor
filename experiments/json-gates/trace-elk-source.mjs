import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {sha256} from './distribution-research.mjs';
const elkjs='a8304cf79fde75bc2ab1a89d28320f53f8637436';
const docs=new URL('../../docs/',import.meta.url);
async function get(url){
  const u=new URL(url);if(u.protocol!=='https:'||!['api.github.com','raw.githubusercontent.com'].includes(u.hostname))throw new Error('unapproved-elk-source');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('elk-source-http-'+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>8*1024**2)throw new Error('elk-source-too-large');return bytes;
}
const api=async path=>JSON.parse(await get('https://api.github.com/repos/'+path));
async function run(){
  const revision=await api('kieler/elkjs/commits/'+elkjs),release=await api('kieler/elkjs/releases/tags/0.9.3');
  const tag=await api('eclipse-elk/elk/git/ref/tags/v0.9.1'),pull=await api('eclipse-elk/elk/pulls/955');
  if(tag.object?.type!=='commit'||!pull.merged)throw new Error('unresolved-elk-reference');
  const baseline=tag.object.sha,patch=pull.merge_commit_sha;
  const latest=(await api('eclipse-elk/elk/commits?until='+encodeURIComponent(revision.commit.committer.date)+'&per_page=1'))[0];
  const build=await get(`https://raw.githubusercontent.com/kieler/elkjs/${elkjs}/build.gradle`);
  const roots=[...build.toString('utf8').matchAll(/\$\{elkRepo\}\/(plugins\/[^"\r\n]+)/g)].map(m=>m[1]);if(!roots.length)throw new Error('elk-source-roots-missing');
  const initial=await api('eclipse-elk/elk/compare/'+baseline+'...'+patch),after=await api('eclipse-elk/elk/compare/'+patch+'...'+latest.sha);
  const inRoots=files=>files.filter(f=>roots.some(root=>f.filename.startsWith(root+'/'))).map(f=>f.filename);
  const output={schema:1,checkedAt:new Date().toISOString(),elkjsCommit:elkjs,releaseURL:release.html_url,releasePublishedAt:release.published_at,baseline:{tag:'v0.9.1',commit:baseline},requiredPatch:{pull:955,commit:patch,head:pull.head.sha},latestBeforeRelease:{commit:latest.sha,date:latest.commit.committer.date},sourceRoots:roots,baselineToPatch:{compareURL:initial.html_url,runtimeFiles:inRoots(initial.files)},patchToLatest:{compareURL:after.html_url,commits:after.commits.map(c=>c.sha),changedFiles:after.files.map(f=>f.filename),runtimeFiles:inRoots(after.files)},sourceChecks:[],originals:[],resolution:'runtime-source-variant-narrowed; exact publisher checkout and complete generated-source chain not uniquely proven'};
  for(const path of output.baselineToPatch.runtimeFiles){
    const checks=[];for(const commit of [baseline,patch,latest.sha]){const url=`https://raw.githubusercontent.com/eclipse-elk/elk/${commit}/${path}`,bytes=await get(url);checks.push({commit,url,sha256:sha256(bytes)});}output.sourceChecks.push({path,checks,patchAndLatestEqual:checks[1].sha256===checks[2].sha256});
  }
  const worker=await readFile(new URL('./node_modules/elkjs/lib/elk-worker.js',import.meta.url)),upstream=await get(`https://raw.githubusercontent.com/kieler/elkjs/${elkjs}/lib/elk-worker.js`);if(sha256(worker)!==sha256(upstream))throw new Error('elk-worker-mismatch');
  const text=worker.toString('utf8');const body=name=>{const start=text.indexOf('function '+name+'(nodeContext)');if(start<0)return '';const end=text.indexOf('\nfunction ',start+1);return text.slice(start,end<0?undefined:end);};
  output.generatedWorker={url:`https://raw.githubusercontent.com/kieler/elkjs/${elkjs}/lib/elk-worker.js`,sha256:sha256(worker),matchesInstalled:true,features:{topdownContext:text.includes('this.topdownLayout =')&&text.includes('TOPDOWN_LAYOUT_2'),widthUsesExistingSize:body('setNodeWidth').includes('nodeContext.topdownLayout')&&body('setNodeWidth').includes('Math.max'),heightUsesExistingSize:body('setNodeHeight').includes('nodeContext.topdownLayout')&&body('setNodeHeight').includes('Math.max')}};
  if(!Object.values(output.generatedWorker.features).every(Boolean))throw new Error('elk-patch-signature-missing');
  for(const [id,repo,commit]of [['elkjs','kieler/elkjs',elkjs],['elk-source-candidate','eclipse-elk/elk',patch]]){
    const url=`https://raw.githubusercontent.com/${repo}/${commit}/LICENSE.md`,bytes=await get(url),reviewPath=`docs/third-party-source-licenses/elk/${id}-LICENSE.txt`;
    const destination=new URL('../'+reviewPath,docs);await mkdir(new URL('./',destination),{recursive:true});await writeFile(destination,bytes);output.originals.push({id,url,reviewPath,sha256:sha256(bytes),bytes:bytes.length});
  }
  await writeFile(new URL('evidence/json-elk-source-trace.json',docs),JSON.stringify(output,null,2));
  console.log(JSON.stringify({baseline,patch,latest:latest.sha,runtimeChanged:output.baselineToPatch.runtimeFiles.length,afterPatchRuntimeChanged:output.patchToLatest.runtimeFiles.length,features:output.generatedWorker.features,exactCheckout:'not-uniquely-proven'},null,2));
}
try{await run();}catch(error){console.log('elk-trace FAIL '+(error.message?.match(/^[a-z0-9-]+$/)?.[0]??error.name));process.exitCode=1;}
