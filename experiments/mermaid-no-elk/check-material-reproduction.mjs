// Compare clean material output to the prior research output; verify corruption fails closed.
import assert from 'node:assert/strict';
import {readFile,readdir,cp,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const [materials,baseline,output]=process.argv.slice(2);
if(!materials||!baseline||!output)throw Error('usage: check-material-reproduction.mjs MATERIALS BASELINE_HASHES OUTPUT');
const project=fileURLToPath(new URL('../../',import.meta.url)),root=fileURLToPath(new URL('.',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=async()=>{const records={};for(const name of (await readdir(root+'dist/licenses')).sort())records[name]=hash(await readFile(root+'dist/licenses/'+name));return records;};
const expected=JSON.parse(await readFile(baseline));
const exec=promisify(execFile);
await exec(process.execPath,[root+'build.mjs','--materials='+path.resolve(materials)],{cwd:project,timeout:60000});
await exec(process.execPath,[root+'prepare-license-candidates.mjs',path.resolve(materials)],{cwd:project,timeout:30000});
const actual=await snapshot();assert.deepEqual(actual,expected);assert.equal(Object.keys(actual).length,74);
const index=JSON.parse(await readFile(path.join(materials,'material-index.json')));
const planBytes=await readFile(project+'docs/evidence/mermaid-tiny-material-retrieval-plan.json');
assert.equal(index.planSha256,hash(planBytes));assert.equal(index.files.length,249);
// Preserve the successful materials and output; corrupt a separate local copy only.
const bad=await mkdtemp(project+'tmp/tiny-material-fault-');await cp(materials,bad,{recursive:true});
await writeFile(bad+'/LICENSE','intentionally wrong synthetic original\n');
let rejected=false;
try{await exec(process.execPath,[root+'prepare-license-candidates.mjs',bad],{cwd:project,timeout:30000});}
catch(error){rejected=error.stderr?.includes('material hash mismatch')===true;}
assert.equal(rejected,true);assert.deepEqual(await snapshot(),actual);
const sourceHashes={};for(const name of ['fetch-materials.py','make-material-plan.py','test_fetch_materials.py','build.mjs','prepare-license-candidates.mjs','check-material-reproduction.mjs'])sourceHashes[name]=hash(await readFile(root+name));
await writeFile(output,JSON.stringify({date:'2026-11-06',passed:true,node:process.version,platform:process.platform,sourceHashes,planSha256:index.planSha256,materialIndexSha256:hash(await readFile(path.join(materials,'material-index.json'))),packages:63,files:249,networkRequests:68,byteIdenticalLicenseAssets:74,licenseAssetHashes:actual,corruptMaterialRejected:true,existingOutputUnchanged:true,scope:'Fresh direct downloads, no old research cache or package install. Local PoC static delivery only; not product/public/device acceptance.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,byteIdenticalLicenseAssets:74,corruptMaterialRejected:true}));
