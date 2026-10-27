import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sha256,verifySRI} from './distribution-research.mjs';
import {readTarGzip} from './source-archive.mjs';

const root=new URL('../../',import.meta.url);
const audit=new URL('evidence/published-wasm/',import.meta.url);
const specs=[['@firecrawl/anydoc-wasm','package/anydoc_wasm_bg.wasm','node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm'],['@embedpdf/pdfium','package/dist/pdfium.wasm','node_modules/@embedpdf/pdfium/dist/pdfium.wasm']];
export async function prepare(){
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  await mkdir(audit,{recursive:true});
  const packages={'':{name:'ldp-publication-audit',version:'0.0.0',dependencies:{}}};
  for(const [name] of specs){const entry=lock.packages['node_modules/'+name];packages[''].dependencies[name]=entry.version;packages['node_modules/'+name]=entry;}
  await writeFile(new URL('package.json',audit),JSON.stringify({...packages[''],private:true},null,2)+'\n');
  await writeFile(new URL('package-lock.json',audit),JSON.stringify({name:'ldp-publication-audit',version:'0.0.0',lockfileVersion:3,requires:true,packages},null,2)+'\n');
}
export async function collect(){
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  const result={schema:1,checkedAt:new Date().toISOString(),scope:'Published archive bytes and registry verification; not a reproducible build or linked-code SBOM',packages:[]};
  for(const [name,archivePath,installedPath] of specs){
    const entry=lock.packages['node_modules/'+name];
    if(!entry.resolved.startsWith('https://registry.npmjs.org/'))throw new Error('unexpected-registry');
    const response=await fetch(entry.resolved,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('archive-http-'+response.status);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>32*1024**2)throw new Error('archive-too-large');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);verifySRI(bytes,entry.integrity);
    const wasm=readTarGzip(bytes).find(e=>e.name===archivePath);
    if(!wasm)throw new Error('missing-wasm');
    const installed=await readFile(new URL(installedPath,root));
    if(sha256(wasm.bytes)!==sha256(installed))throw new Error('published-installed-mismatch');
    result.packages.push({name,version:entry.version,tarball:entry.resolved,integrity:entry.integrity,archiveSha256:sha256(bytes),archiveBytes:bytes.length,archiveIntegrity:'verified',archivePath,wasmSha256:sha256(wasm.bytes),wasmBytes:wasm.bytes.length,installedMatch:true});
  }
  await writeFile(new URL('docs/evidence/json-published-wasm-correspondence.json',root),JSON.stringify(result,null,2)+'\n');
  console.log('Published WASM archive matches: '+result.packages.length);
}
export async function review(){
  const bytes=await readFile(new URL('signatures.json',audit));
  const result=JSON.parse(bytes);
  if(!Array.isArray(result.invalid)||!Array.isArray(result.missing)||result.invalid.length||result.missing.length||result.verified?.length!==1)throw new Error('attestation-verification-incomplete');
  const summary=await readFile(new URL('signatures.log',audit),'utf8');
  if(!summary.includes('2 packages have verified registry signatures')||!summary.includes('1 package has a verified attestation'))throw new Error('registry-summary-mismatch');
  const anydoc=result.verified.find(p=>p.name===specs[0][0]);
  const bundle=anydoc?.attestationBundles?.find(b=>b.predicateType==='https://slsa.dev/provenance/v1');
  if(!bundle)throw new Error('provenance-missing');
  const statement=JSON.parse(Buffer.from(bundle.bundle.dsseEnvelope.payload,'base64'));
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  const expected=Buffer.from(lock.packages['node_modules/'+specs[0][0]].integrity.slice(7),'base64').toString('hex');
  if(!statement.subject.some(s=>s.digest.sha512===expected)||!statement.predicate.buildDefinition.resolvedDependencies.some(d=>d.digest.gitCommit==='4a45addbd607e8b59f0c263bca26aab228e10370'))throw new Error('provenance-lock-source-mismatch');
  await writeFile(new URL('docs/evidence/json-npm-signature-verification.json',root),bytes);
  await writeFile(new URL('docs/evidence/json-npm-signature-summary.txt',root),summary.replaceAll('\r\n','\n').trimEnd()+'\n');
  console.log('Preserved npm verification result: 2 registry signatures, 1 provenance attestation');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{if(process.argv[2]==='prepare')await prepare();else if(process.argv[2]==='collect')await collect();else if(process.argv[2]==='review')await review();else throw new Error('expected-prepare-collect-or-review');}catch(error){console.error(error.message);process.exitCode=1;}}
