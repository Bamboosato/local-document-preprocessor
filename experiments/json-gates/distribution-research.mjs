import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifySRI(bytes,integrity){
  if(!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity))throw new Error('unsupported-integrity');
  if('sha512-'+createHash('sha512').update(bytes).digest('base64')!==integrity)throw new Error('archive-integrity-mismatch');
  return true;
}
export function lockCandidates(text){
  const blocks=text.split(/^\[\[package\]\]\s*$/m).slice(1);
  const candidates=[];
  for(const block of blocks){
    const value=key=>new RegExp('^'+key+' = "([^"\\r\\n]+)"$','m').exec(block)?.[1];
    const source=value('source');if(!source)continue;
    if(source!=='registry+https://github.com/rust-lang/crates.io-index')throw new Error('unsupported-crate-source');
    const name=value('name'),version=value('version'),checksum=value('checksum');
    if(!/^[A-Za-z0-9_-]+$/.test(name??'')||!/^[0-9A-Za-z.+-]+$/.test(version??'')||!/^[a-f0-9]{64}$/.test(checksum??''))throw new Error('invalid-lock-candidate');
    candidates.push({name,version,checksum});
  }
  if(!candidates.length)throw new Error('empty-lock-candidates');
  if(new Set(candidates.map(p=>p.name+'@'+p.version)).size!==candidates.length)throw new Error('duplicate-lock-candidate');
  return {workspaceLockPackages:blocks.length,candidates};
}
export function attestationClaims(document){
  return (document.attestations??[]).flatMap(a=>{
    const payload=a.bundle?.dsseEnvelope?.payload;
    if(!payload)return [];
    const p=JSON.parse(Buffer.from(payload,'base64').toString('utf8'));
    return [{predicateType:p.predicateType,subject:p.subject,source:p.predicate?.buildDefinition?.resolvedDependencies??[],workflow:p.predicate?.buildDefinition?.externalParameters?.workflow??null,cryptographicVerification:'not-performed'}];
  });
}
const hosts=new Set(['registry.npmjs.org','raw.githubusercontent.com','crates.io']);
async function download(url,max=20*1024**2){
  const target=new URL(url);if(target.protocol!=='https:'||!hosts.has(target.hostname))throw new Error('unapproved-source');
  const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'LDP-distribution-research/1.0 (https://github.com/Bamboosato/local-document-preprocessor)'}});
  if(!response.ok)throw new Error('source-http-'+response.status);
  if(Number(response.headers.get('content-length'))>max)throw new Error('source-too-large');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new Error('source-too-large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
const json=async url=>JSON.parse((await download(url)).toString('utf8'));
const root=new URL('../../',import.meta.url);
const anydoc='4a45addbd607e8b59f0c263bca26aab228e10370';
const elk='a8304cf79fde75bc2ab1a89d28320f53f8637436';
const pdfium='07ed5fe3739ec22522450863282b1b0618b88a6f';
export async function research(){
  const output={schema:1,checkedAt:new Date().toISOString(),scope:'read-only public source investigation; not distribution approval or WASM target SBOM',npm:[],sources:[],crates:[]};
  for(const [name,version,origin]of [['elkjs','0.9.3','prototype'],['@firecrawl/anydoc-wasm','0.1.7','root'],['@embedpdf/pdfium','2.14.4','root']]){
    const base=origin==='root'?root:new URL('./',import.meta.url);
    const lock=JSON.parse(await readFile(new URL('package-lock.json',base),'utf8'));
    const meta=lock.packages['node_modules/'+name];
    const registryURL='https://registry.npmjs.org/'+encodeURIComponent(name)+'/'+version;
    const p=await json(registryURL);
    if(p.name!==name||p.version!==version||meta.version!==version||p.dist?.integrity!==meta.integrity||p.dist?.tarball!==meta.resolved)throw new Error('registry-lock-mismatch');
    verifySRI(await download(p.dist.tarball),meta.integrity);
    output.npm.push({name,version,registryURL,gitHead:p.gitHead??null,tarball:meta.resolved,integrity:meta.integrity,archiveIntegrity:'verified'});
  }
  const sources=[
    ['elk-bundle',`https://raw.githubusercontent.com/kieler/elkjs/${elk}/lib/elk.bundled.js`,'experiments/json-gates/node_modules/elkjs/lib/elk.bundled.js'],
    ['elk-build',`https://raw.githubusercontent.com/kieler/elkjs/${elk}/build.gradle`],
    ['elk-ci',`https://raw.githubusercontent.com/kieler/elkjs/${elk}/.github/workflows/ci.yml`],
    ['anydoc-cargo',`https://raw.githubusercontent.com/firecrawl/anydoc/${anydoc}/Cargo.toml`],
    ['anydoc-wasm-cargo',`https://raw.githubusercontent.com/firecrawl/anydoc/${anydoc}/wasm/Cargo.toml`],
    ['anydoc-lock',`https://raw.githubusercontent.com/firecrawl/anydoc/${anydoc}/Cargo.lock`],
    ['anydoc-release',`https://raw.githubusercontent.com/firecrawl/anydoc/${anydoc}/.github/workflows/release.yml`],
    ['pdfium-wasm',`https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/${pdfium}/packages/pdfium/src/vendor/pdfium.wasm`,'node_modules/@embedpdf/pdfium/dist/pdfium.wasm'],
    ['pdfium-notice',`https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/${pdfium}/packages/pdfium/LICENSE.pdfium`,'node_modules/@embedpdf/pdfium/LICENSE.pdfium'],
    ['pdfium-submodules',`https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/${pdfium}/.gitmodules`],
    ['pdfium-build',`https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/${pdfium}/packages/pdfium/scripts/build.sh`],
    ['pdfium-toolchain',`https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/${pdfium}/packages/pdfium/Dockerfile`],
  ];
  let cargo;
  for(const [id,url,local]of sources){
    const bytes=await download(url),hash=sha256(bytes);
    if(local&&sha256(await readFile(new URL(local,root)))!==hash)throw new Error('source-installed-mismatch');
    output.sources.push({id,url,sha256:hash,bytes:bytes.length,installedMatch:local?true:null});
    if(id==='anydoc-lock')cargo=lockCandidates(bytes.toString('utf8'));
  }
  output.attestations=attestationClaims(await json('https://registry.npmjs.org/-/npm/v1/attestations/@firecrawl%2fanydoc-wasm@0.1.7'));
  const claim=output.attestations.find(p=>p.predicateType==='https://slsa.dev/provenance/v1');
  const expected=Buffer.from(output.npm.find(p=>p.name==='@firecrawl/anydoc-wasm').integrity.slice(7),'base64').toString('hex');
  if(!claim?.subject?.some(s=>s.digest?.sha512===expected)||!claim.source.some(s=>s.digest?.gitCommit===anydoc))throw new Error('provenance-content-mismatch');
  output.cargoScope={workspaceLockPackages:cargo.workspaceLockPackages,registryCandidates:cargo.candidates.length,wasmTargetClosure:'not-derived'};
  // Two read-only requests at a time, with a short delay between batches.
  for(let i=0;i<cargo.candidates.length;i+=2){
    const batch=await Promise.all(cargo.candidates.slice(i,i+2).map(async p=>{
      const url=`https://crates.io/api/v1/crates/${p.name}/${p.version}`;
      const v=(await json(url)).version;
      if(v?.num!==p.version||v.checksum!==p.checksum)throw new Error('crate-lock-mismatch');
      return {...p,metadataURL:url,declaredLicense:v.license??null,licenseOriginals:'not-collected',wasmIncluded:'not-determined'};
    }));output.crates.push(...batch);await new Promise(resolve=>setTimeout(resolve,150));
  }
  const directory=new URL('./evidence/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('distribution-research.json',directory),JSON.stringify(output,null,2));
  return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{const o=await research();const licenses={};for(const p of o.crates)licenses[p.declaredLicense??'unknown']=(licenses[p.declaredLicense??'unknown']??0)+1;console.log(JSON.stringify({status:'completed',npm:o.npm.length,sourceChecks:o.sources.length,cargo:o.cargoScope,declaredLicenses:licenses,approval:'pending'},null,2));}
  catch(error){console.log('distribution-research FAIL '+(error.message?.match(/^[a-z0-9-]+$/)?.[0]??error.name));process.exitCode=1;}
}
