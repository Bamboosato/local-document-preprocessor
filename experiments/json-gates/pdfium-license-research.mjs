import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {sha256} from './distribution-research.mjs';
import {safeArchivePath} from './source-archive.mjs';
const commit='cb29e78f2ba00c9298714d5f4a8bf7765f1e802f';
const base=`https://raw.githubusercontent.com/embedpdf/pdfium/${commit}/`;
let stage='tree',currentSource='';
async function get(url){
  const u=new URL(url);if(u.protocol!=='https:'||!['api.github.com','raw.githubusercontent.com','chromium.googlesource.com'].includes(u.hostname))throw new Error('unapproved-pdfium-source');
  currentSource=u.hostname+u.pathname;
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('pdfium-source-http-'+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>8*1024**2)throw new Error('pdfium-source-too-large');return bytes;
}
const root=new URL('../../docs/',import.meta.url);
const output={schema:1,checkedAt:new Date().toISOString(),repository:'https://github.com/embedpdf/pdfium',commit,scope:'conservative source/DEPS license candidates; not proof of components linked into published WASM',sources:[],originals:[],external:[]};
async function save(id,url,bytes,kind){
  const name=safeArchivePath(id).replaceAll('/','__');const path=`docs/third-party-source-licenses/pdfium/${name}.txt`;
  const file=new URL('../'+path,root);await mkdir(new URL('./',file),{recursive:true});await writeFile(file,bytes);
  output.originals.push({id,url,reviewPath:path,sha256:sha256(bytes),bytes:bytes.length,sourceKind:kind});
}
async function run(){
  const treeURL=`https://api.github.com/repos/embedpdf/pdfium/git/trees/${commit}?recursive=1`;
  const treeBytes=process.argv.includes('--local-tree')?await readFile(new URL('./evidence/source-audit/pdfium-tree.json',import.meta.url)):await get(treeURL);
  const tree=JSON.parse(treeBytes);if(tree.truncated||!Array.isArray(tree.tree))throw new Error('pdfium-tree-truncated');
  output.sources.push({url:treeURL,sha256:sha256(treeBytes),treeObject:tree.sha});
  const deps=await get(base+'DEPS'),text=deps.toString('utf8');output.sources.push({url:base+'DEPS',sha256:sha256(deps)});
  const files=new Set(tree.tree.filter(e=>e.type==='blob'&&(e.path==='LICENSE'||e.path==='AUTHORS'||/^third_party\//.test(e.path)&&/(^|\/)(licen[sc]e[^/]*|copying[^/]*|notice[^/]*|authors[^/]*|FTL\.TXT)$/i.test(e.path))).map(e=>e.path));
  for(const entry of tree.tree.filter(e=>e.type==='blob'&&/^third_party\/[^/]+\/README\.pdfium$/.test(e.path))){
    const bytes=await get(base+entry.path),body=bytes.toString('utf8');output.sources.push({url:base+entry.path,sha256:sha256(bytes),declaredLicense:/^License: (.+)$/m.exec(body)?.[1]??null,shipped:/^Shipped: (.+)$/m.exec(body)?.[1]??null});
    for(const match of body.matchAll(/^License File: (.+)$/gm)){
      const path=entry.path.slice(0,entry.path.lastIndexOf('/')+1)+match[1].trim();if(tree.tree.some(e=>e.path===path&&e.type==='blob'))files.add(path);
    }
  }
  for(const path of [...files].sort())await save('in-tree/'+path,base+path,await get(base+path),'fixed-pdfium-source');
  const external=[
    ['abseil','abseil_revision','chromium/src/third_party/abseil-cpp'],
    ['brotli','brotli_revision','chromium/src/third_party/brotli'],
    ['fast-float','fast_float_revision','external/github.com/fastfloat/fast_float'],
    ['freetype','freetype_revision','chromium/src/third_party/freetype2'],
    ['harfbuzz','harfbuzz_revision','external/github.com/harfbuzz/harfbuzz'],
    ['icu','icu_revision','chromium/deps/icu'],
    ['libpng','libpng_revision','chromium/src/third_party/libpng'],
    ['zlib','zlib_revision','chromium/src/third_party/zlib'],
    ['jpeg-turbo','jpeg_turbo_revision','chromium/deps/libjpeg_turbo'],
  ];
  for(const [id,key,repository]of external){
    stage='deps-'+id;
    const revision=new RegExp("'"+key+"': '([a-f0-9]{40})'").exec(text)?.[1];if(!revision)throw new Error('pdfium-deps-revision-missing');
    const gitiles=`https://chromium.googlesource.com/${repository}/+/${revision}/`;
    const listing=JSON.parse((await get(gitiles+'?format=JSON')).toString('utf8').replace(/^\)\]\}'\n/,''));
    const names=listing.entries.filter(e=>e.type==='blob'&&/^(licen[sc]e|copying|notice|copyright|authors|patents|readme\.ijg)/i.test(e.name)).map(e=>e.name);
    if(id==='freetype')names.push('docs/FTL.TXT','docs/GPLv2.TXT');
    const before=output.originals.length;
    for(const name of [...new Set(names)]){const url=gitiles+name+'?format=TEXT';const bytes=Buffer.from((await get(url)).toString('ascii'),'base64');if(!bytes.length)throw new Error('empty-gitiles-original');await save('deps/'+id+'/'+name,url,bytes,'fixed-deps-candidate');}
    output.external.push({id,revision,repository:'https://chromium.googlesource.com/'+repository,originalCount:output.originals.length-before,inclusionInPublishedWASM:'not-proven'});
    console.log('pdfium-license source '+id+' '+(output.originals.length-before));
  }
  await writeFile(new URL('evidence/json-pdfium-source-licenses.json',root),JSON.stringify(output,null,2));
  console.log('pdfium-license originals='+output.originals.length+'; binary component coverage remains unproven');
}
try{await run();}catch(error){const codes=[];const visit=e=>{if(e?.code)codes.push(e.code);if(e?.cause)visit(e.cause);for(const x of e?.errors??[])visit(x);};visit(error);console.log('pdfium-license FAIL stage='+stage+' '+(error.message?.match(/^[a-z0-9-]+$/)?.[0]??error.name)+' '+codes.join(','));console.log('public-source '+currentSource);process.exitCode=1;}
