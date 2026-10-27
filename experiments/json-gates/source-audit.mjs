import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {readTarGzip,licenseEntries,targetCandidates,safeArchivePath} from './source-archive.mjs';
import {sha256} from './distribution-research.mjs';
const root=new URL('./evidence/source-audit/',import.meta.url),commit='4a45addbd607e8b59f0c263bca26aab228e10370';
const json=async url=>JSON.parse(await readFile(url,'utf8'));
const records=await json(new URL('../../docs/evidence/json-distribution-source-records.json',import.meta.url));
async function get(url,max=64*1024**2){
  const u=new URL(url);if(u.protocol!=='https:'||!['codeload.github.com','static.crates.io','raw.githubusercontent.com'].includes(u.hostname))throw new Error('unapproved-source');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('source-http-'+r.status);
  const chunks=[];let length=0;for await(const b of r.body){length+=b.length;if(length>max)throw new Error('source-too-large');chunks.push(b);}return Buffer.concat(chunks);
}
async function prepare(){
  await mkdir(root,{recursive:true});const bytes=await get(`https://codeload.github.com/firecrawl/anydoc/tar.gz/${commit}`);
  const entries=readTarGzip(bytes),prefix=`anydoc-${commit}/`,source=new URL('anydoc/',root);await mkdir(source,{recursive:true});
  for(const e of entries){if(!e.name.startsWith(prefix))throw new Error('source-root-mismatch');const relative=safeArchivePath(e.name.slice(prefix.length));const destination=new URL(relative,source);await mkdir(new URL('./',destination),{recursive:true});await writeFile(destination,e.bytes);}
  const lock=await readFile(new URL('Cargo.lock',source));if(sha256(lock)!==records.sources.find(s=>s.id==='anydoc-lock').sha256)throw new Error('source-lock-mismatch');
  await writeFile(new URL('source.json',root),JSON.stringify({repository:'https://github.com/firecrawl/anydoc',commit,archiveSha256:sha256(bytes),lockSha256:sha256(lock)},null,2));console.log('source-audit PREPARED fixed source; no upstream build executed');
  await writeFile(new URL('resolve.sh',root),(await readFile(new URL('./resolve-wasm-closure.sh',import.meta.url),'utf8')).replaceAll('\r\n','\n'));
}
async function collect(){
  const before=await json(new URL('source.json',root));if(sha256(await readFile(new URL('anydoc/Cargo.lock',root)))!==before.lockSha256)throw new Error('source-lock-changed');
  const selected=targetCandidates(await readFile(new URL('target-tree.txt',root),'utf8'),records.crates);
  const metadata=await json(new URL('cargo-metadata.json',root));
  const output={schema:1,checkedAt:new Date().toISOString(),source:before,target:'wasm32-unknown-unknown',kinds:['normal','build'],devDependencies:false,interpretation:'Cargo resolved graph for fixed source; not an SBOM extracted from published WASM',packages:[]};
  const all=[...selected],cacheDirectories=await readdir(new URL('cargo-home/registry/cache/',root));
  for(let i=0;i<all.length;i++){
    const p=all[i],url=`https://static.crates.io/crates/${p.name}/${p.name}-${p.version}.crate`;let archive;
    for(const directory of cacheDirectories.filter(d=>/^index\.crates\.io-[a-f0-9]+$/.test(d))){try{archive=await readFile(new URL(`cargo-home/registry/cache/${directory}/${p.name}-${p.version}.crate`,root));break;}catch(error){if(error.code!=='ENOENT')throw error;}}
    archive??=await get(url);
    if(sha256(archive)!==p.checksum)throw new Error('crate-archive-checksum-mismatch');
    const archiveEntries=readTarGzip(archive),prefix=`${p.name}-${p.version}/`;
    if(archiveEntries.some(e=>!e.name.startsWith(prefix)))throw new Error('crate-root-mismatch');
    const entries=archiveEntries.map(e=>({name:e.name.slice(prefix.length),bytes:e.bytes}));
    const meta=metadata.packages.find(m=>m.name===p.name&&m.version===p.version);if(!meta)throw new Error('metadata-package-missing');
    const licenseFile=meta.license_file?.split(prefix).at(-1);
    const notices=licenseEntries(entries,licenseFile),collected=[];
    for(const notice of notices){const relative=safeArchivePath(notice.name),destination=new URL(`licenses/${p.name}@${p.version}/${relative}`,root);await mkdir(new URL('./',destination),{recursive:true});await writeFile(destination,notice.bytes);collected.push({path:`licenses/${p.name}@${p.version}/${relative}`,sha256:sha256(notice.bytes),bytes:notice.bytes.length});}
    let fallback=null;
    if(!collected.length&&['include_dir','include_dir_macros'].includes(p.name)){
      const vcs=JSON.parse(entries.find(e=>e.name==='.cargo_vcs_info.json')?.bytes.toString('utf8')??'null');
      const original=entries.find(e=>e.name==='Cargo.toml.orig')?.bytes.toString('utf8')??'';
      if(vcs?.git?.sha1!=='d742c6fffce99ee89da91b934e7ce6fb2a82680c'||vcs.path_in_vcs!==(p.name==='include_dir'?'include_dir':'macros')||!original.includes('license.workspace = true'))throw new Error('unverified-workspace-license');
      const base=`https://raw.githubusercontent.com/Michael-F-Bryan/include_dir/${vcs.git.sha1}/`;
      const manifest=await get(base+'Cargo.toml');if(!manifest.toString('utf8').includes('license = "MIT"')||!manifest.toString('utf8').includes('version = "0.7.4"'))throw new Error('workspace-license-mismatch');
      const bytes=await get(base+'LICENSE'),path=`licenses/${p.name}@${p.version}/UPSTREAM-LICENSE`;
      await mkdir(new URL('./',new URL(path,root)),{recursive:true});await writeFile(new URL(path,root),bytes);
      collected.push({path,sha256:sha256(bytes),bytes:bytes.length,sourceKind:'pinned-workspace-repository',sourceURL:base+'LICENSE'});
      fallback={commit:vcs.git.sha1,pathInVcs:vcs.path_in_vcs,manifestURL:base+'Cargo.toml',manifestSha256:sha256(manifest)};
    }
    output.packages.push({name:p.name,version:p.version,features:p.features,declaredLicense:meta.license??p.declaredLicense,checksum:p.checksum,sourceArchive:url,archiveVerified:true,originals:collected,...(fallback?{workspaceFallback:fallback}:{}),status:collected.length?'originals-collected':'originals-missing'});
    if(i%20===0)console.log('source-audit progress '+(i+1)+'/'+all.length);
  }
  const workspace=[];
  for(const path of ['LICENSE','wasm/LICENSE']){const bytes=await readFile(new URL('anydoc/'+path,root));const target=new URL('licenses/workspace/'+path,root);await mkdir(new URL('./',target),{recursive:true});await writeFile(target,bytes);workspace.push({path:'licenses/workspace/'+path,sha256:sha256(bytes),bytes:bytes.length});}
  output.workspaceOriginals=workspace;output.missing=output.packages.filter(p=>p.status==='originals-missing').map(p=>p.name+'@'+p.version);
  output.toolchain=await json(new URL('toolchain.json',root));
  await writeFile(new URL('target-licenses.json',root),JSON.stringify(output,null,2));
  console.log(JSON.stringify({status:'collected',registryPackages:output.packages.length,originalFiles:output.packages.reduce((n,p)=>n+p.originals.length,0)+workspace.length,missing:output.missing},null,2));
}
async function writeReviewArtifacts(){
  const output=await json(new URL('target-licenses.json',root));if(output.missing.length)throw new Error('originals-still-missing');
  for(const [group,items]of [...output.packages.map(p=>[p.name+'@'+p.version,p.originals]),['workspace',output.workspaceOriginals]]){
    for(let i=0;i<items.length;i++){
      const item=items[i],bytes=await readFile(new URL(item.path,root));if(sha256(bytes)!==item.sha256)throw new Error('original-hash-mismatch');
      const name=item.path.split('/').at(-1).replace(/[^A-Za-z0-9._-]/g,'_');
      item.reviewPath=`docs/third-party-source-licenses/anydoc/${group}/${String(i).padStart(3,'0')}-${name}.txt`;
      const destination=new URL('../../'+item.reviewPath,import.meta.url);await mkdir(new URL('./',destination),{recursive:true});await writeFile(destination,bytes);
    }
  }
  await writeFile(new URL('../../docs/evidence/json-anydoc-target-licenses.json',import.meta.url),JSON.stringify(output,null,2));
  console.log('source-audit REVIEW originals and manifest generated; distribution approval remains pending');
}
try{if(process.argv[2]==='prepare')await prepare();else if(process.argv[2]==='collect')await collect();else if(process.argv[2]==='review')await writeReviewArtifacts();else throw new Error('unknown-audit-mode');}
catch(error){console.log('source-audit FAIL '+(error.message?.match(/^[a-z0-9-]+$/)?.[0]??error.name));process.exitCode=1;}
