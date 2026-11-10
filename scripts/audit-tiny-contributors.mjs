// The flat Tiny npm package declares no dependencies. Audit its reviewed input
// versions separately; npm aliases keep every version of repeated names in scope.
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readTinyRelease,verifyTinyRuntime,verifyTinyAuditBinding} from './tiny-release.mjs';
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.env.npm_execpath)throw Error('Run via npm run audit:tiny');
const release=await readTinyRelease(),isDefaultGate=process.argv.length===2;
const [inventoryPath=release.auditScope,planPath=release.auditPlan,outputPath='.security-audit/tiny-contributors.json']=process.argv.slice(2);
const inventoryBytes=await readFile(new URL(inventoryPath,root));
const planBytes=await readFile(new URL(planPath,root));
if(isDefaultGate){await verifyTinyRuntime(release);verifyTinyAuditBinding(release,inventoryBytes,planBytes);}
const inventory=JSON.parse(inventoryBytes),plan=JSON.parse(planBytes);
const count=inventory.packages.length;
if(!Number.isInteger(count)||count<1||count>1000||inventory.sourceCommit!==plan.sourceCommit)throw Error('Unexpected contributor inventory');
if(new Set(inventory.packages.map(p=>p.name+'@'+p.version)).size!==count)throw Error('Duplicate contributor pair');
await mkdir(new URL('tmp/',root),{recursive:true});
const directory=await mkdtemp(fileURLToPath(new URL('tmp/tiny-advisory-audit-',root)));
const dependencies={},records=[],packages={};
for(const [index,pkg] of inventory.packages.entries()){
  const alias='tiny-input-'+String(index).padStart(3,'0');
  const source=plan.npm.find(p=>p.name===pkg.name&&p.version===pkg.version);
  if(!source)throw Error('Contributor missing from retrieval plan');
  dependencies[alias]=`npm:${pkg.name}@${pkg.version}`;
  packages['node_modules/'+alias]={name:pkg.name,version:pkg.version,resolved:source.url,integrity:source.integrity};
  records.push({alias,name:pkg.name,version:pkg.version});
}
const manifest={name:'tiny-contributor-audit-only',version:'0.0.0',private:true,dependencies};
packages['']=manifest;
const lockBytes=Buffer.from(JSON.stringify({name:manifest.name,version:manifest.version,lockfileVersion:3,requires:true,packages},null,2)+'\n');
await writeFile(directory+'/package.json',JSON.stringify(manifest));await writeFile(directory+'/package-lock.json',lockBytes);
const result=spawnSync(process.execPath,[process.env.npm_execpath,'audit','--package-lock-only','--omit=dev','--json'],{cwd:directory,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:4*1024*1024});
if(result.error||![0,1].includes(result.status))throw Error('Contributor audit could not complete');
const audit=JSON.parse(result.stdout);
if(audit.error||audit.metadata?.dependencies?.total!==count)throw Error('Contributor audit coverage mismatch');
const output=new URL(outputPath,root);await mkdir(new URL('.',output),{recursive:true});
await writeFile(output,JSON.stringify({date:new Date().toISOString(),defaultGateBoundToInstalledRelease:isDefaultGate,bundleSha256:inventory.bundleSha256,inventorySha256:sha(inventoryBytes),auditLockSha256:sha(lockBytes),contributors:records,audit,scope:`All ${count} reviewed package/version pairs, alias-preserved; package advisory matching is not proof of application reachability. No dependencies installed or executed.`},null,2)+'\n');
console.log('Tiny contributor vulnerabilities:',audit.metadata.vulnerabilities);
process.exitCode=audit.metadata.vulnerabilities.total?1:0;
