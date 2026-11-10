// Local research assets only. The inventory is not a legal approval.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const upstream=process.argv[2];if(!upstream)throw Error('usage: node prepare-license-candidates.mjs UPSTREAM_ROOT');
const root=path.resolve(upstream),local=fileURLToPath(new URL('.',import.meta.url));
let materials;try{materials=JSON.parse(await readFile(path.join(root,'material-index.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const confined=relative=>{if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('unsafe material path');return path.join(root,...relative.split('/'));};
const originsDirectory=process.argv[3]?path.resolve(process.argv[3]):materials?path.join(root,'origins'):path.resolve(root,'../..','source-origins');
const dist=path.join(local,'dist'),target=path.join(dist,'licenses');
const inventory=JSON.parse(await readFile(new URL('../../docs/evidence/mermaid-tiny-license-inventory.json',import.meta.url),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(materials){
  const planBytes=await readFile(new URL('../../docs/evidence/mermaid-tiny-material-retrieval-plan.json',import.meta.url));
  const plan=JSON.parse(planBytes);
  if(materials.schema!==1||materials.planSha256!==sha(planBytes)||materials.sourceCommit!==plan.sourceCommit)throw Error('material plan mismatch');
  const expected=plan.npm.filter(p=>'patched' in p).map(p=>({name:p.name,version:p.version,patched:p.patched,materialDirectory:p.materialDirectory}));
  if(JSON.stringify(materials.packages)!==JSON.stringify(expected))throw Error('material package inventory mismatch');
  const planned=[...plan.source.files,...plan.npm.flatMap(p=>p.files),...plan.originals];
  if(materials.files.length!==planned.length||new Set(materials.files.map(f=>f.path.toLowerCase())).size!==planned.length)throw Error('material file inventory mismatch');
  for(const f of planned){
    const record=materials.files.find(r=>r.path===f.target);if(!record)throw Error('material missing');
    const bytes=await readFile(confined(f.target));
    if(bytes.length!==record.bytes||sha(bytes)!==record.sha256||(!f.identityOnly&&(bytes.length!==f.bytes||sha(bytes)!==f.sha256)))throw Error('material hash mismatch');
  }
  for(const [name,digest] of Object.entries(plan.evidenceHashes))if(sha(await readFile(new URL('../../docs/evidence/'+name,import.meta.url)))!==digest)throw Error('material evidence changed');
}
const inventoryBytes=await readFile(new URL('../../docs/evidence/mermaid-tiny-license-inventory.json',import.meta.url));
const audit=JSON.parse(await readFile(new URL('../../docs/evidence/mermaid-tiny-notice-audit.json',import.meta.url),'utf8'));
const workspaceAudit=JSON.parse(await readFile(new URL('../../docs/evidence/mermaid-tiny-workspace-notice-audit.json',import.meta.url),'utf8'));
if(audit.inventorySha256!==sha(inventoryBytes)||audit.bundleSha256!==inventory.bundleSha256)throw Error('notice evidence mismatch');
if(workspaceAudit.inventorySha256!==sha(inventoryBytes)||workspaceAudit.bundleSha256!==inventory.bundleSha256)throw Error('workspace notice mismatch');
const lineage=JSON.parse(await readFile(new URL('../../docs/evidence/mermaid-tiny-parser-lineage.json',import.meta.url),'utf8'));
const generatorDir=materials?path.join(root,'generator'):path.join(root,'node_modules/langium-cli');
const generatorPackage=JSON.parse(await readFile(path.join(generatorDir,'package.json'),'utf8'));
const generatorOriginal=await readFile(path.join(generatorDir,'LICENSE'));
if(generatorPackage.name!==lineage.generator.name||generatorPackage.version!==lineage.generator.version||generatorPackage.license!==lineage.generator.license||sha(generatorOriginal)!==lineage.generator.licenseSha256)throw Error('generator original mismatch');
const patchSpecs=[
  {package:'fastdom@1.0.12',file:'fastdom.patch',sha256:'10bad52c2ff6c742f43492850f2a5a74e9d70a33f42a442cdbda4e174356aa87',explanation:'上流のES module形式への変更。変更後の2つのJSがbundleに寄与。'},
  {package:'roughjs@4.6.6',file:'roughjs.patch',sha256:'3543d47108cb41b68ec6a671c0e1f9d0cfe2ce524fea5b0992511ae84c3c6b64',explanation:'上流の型定義への変更。変更対象の型定義はbundleのJSに寄与しない。'}
];
const patchData=[];
for(const spec of patchSpecs){const bytes=await readFile(path.join(root,'patches',spec.file));if(sha(bytes)!==spec.sha256)throw Error('upstream patch mismatch');patchData.push({...spec,bytes});}
if(sha(await readFile(path.join(dist,'tiny.js')))!==inventory.bundleSha256)throw Error('bundle mismatch');
const installed=materials?[]:await readdir(path.join(root,'node_modules/.pnpm'));
const all=[];
for(const pkg of inventory.packages){
  if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(pkg.name)||!/^[0-9][a-z0-9.+-]*$/i.test(pkg.version))throw Error('unsafe package identity');
  const prefix=pkg.name.replace('/','+')+'@'+pkg.version;
  const material=materials?.packages.find(p=>p.name===pkg.name&&p.version===pkg.version);
  const candidates=materials?(material?[material.materialDirectory]:[]):installed.filter(x=>x===prefix||x.startsWith(prefix+'_'));
  if(!candidates.length)throw Error('package missing: '+pkg.name);
  let match;
  for(const candidate of candidates){
    const dir=materials?confined(candidate):path.join(root,'node_modules/.pnpm',candidate,'node_modules',...pkg.name.split('/'));
    let json;try{json=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));}catch{continue;}
    if(json.name!==pkg.name||json.version!==pkg.version)continue;
    if((materials?material.patched:Boolean(candidate.includes('_patch_hash=')))!==pkg.patched)continue;
    const originals=[];let valid=true;
    for(const f of pkg.originals){
      if(path.basename(f.name)!==f.name)throw Error('bad original name');
      try{const bytes=await readFile(path.join(dir,f.name));if(bytes.length!==f.bytes||sha(bytes)!==f.sha256){valid=false;break;}originals.push({name:f.name,bytes,sha256:f.sha256});}catch{valid=false;break;}
    }
    if(valid){match={originals,dir};break;}
  }
  if(!match||!match.originals.length)throw Error('original mismatch: '+pkg.name+'@'+pkg.version);
  const notice=audit.packages.filter(x=>x.name===pkg.name&&x.version===pkg.version);
  if(notice.length!==1)throw Error('notice package mismatch');
  const blocks=new Set();
  for(const file of notice[0].markedFiles){
    if(file.path.split('/').includes('..'))throw Error('bad notice path');
    const bytes=await readFile(path.join(match.dir,file.path));if(sha(bytes)!==file.sha256)throw Error('notice source mismatch');
    const content=bytes.toString('utf8');
    const comments=content.match(/\/\*[\s\S]*?\*\/|(?:^\s*\/\/[^\n]*(?:\n|$))+/gm)||[];
    const found=comments.filter(c=>/\bcopyright\b|SPDX-License-Identifier\s*:|@license\b/i.test(c));
    if(!found.length)throw Error('unmapped notice: '+pkg.name+'/'+file.path);
    for(const block of found){if(block.length>10000)throw Error('oversized notice');blocks.add(block);}
  }
  all.push({name:pkg.name,version:pkg.version,license:pkg.declaredLicense,originals:match.originals,patched:pkg.patched,blocks:[...blocks]});
}
for(const pkg of inventory.workspace){
  if(pkg.original.path.startsWith('/')||pkg.original.path.split('/').includes('..'))throw Error('unsafe workspace path');
  const bytes=await readFile(path.join(root,pkg.original.path));
  if(bytes.length!==pkg.original.bytes||sha(bytes)!==pkg.original.sha256)throw Error('workspace original mismatch');
  const matches=workspaceAudit.workspaces.filter(w=>w.name===pkg.role);if(matches.length!==1)throw Error('workspace scope mismatch');
  const blocks=new Set();
  for(const file of matches[0].markedFiles){
    if(file.physical.split('/').includes('..'))throw Error('unsafe workspace file');
    const content=await readFile(path.join(root,'packages',pkg.role,file.physical));if(sha(content)!==file.sha256)throw Error('workspace source hash mismatch');
    const comments=content.toString('utf8').match(/\/\*[\s\S]*?\*\/|(?:^\s*\/\/[^\n]*(?:\n|$))+/gm)||[];
    const found=comments.filter(c=>/\bcopyright\b|\(c\)\s*\d{4}|©\s*\d{4}|SPDX-License-Identifier\s*:|@license\b|\bMIT licen[cs]e\b|based on[^\n]*https?:\/\//i.test(c));
    if(!found.length)throw Error('workspace notice not mapped');
    for(const block of found){if(block.length>10000)throw Error('oversized workspace notice');blocks.add(block);}
  }
  all.push({name:pkg.name,version:pkg.version,license:pkg.declaredLicense,originals:[{name:'LICENSE',bytes,sha256:sha(bytes)}],patched:false,blocks:[...blocks]});
}
const origins=JSON.parse(await readFile(new URL('../../docs/evidence/mermaid-tiny-source-origins.json',import.meta.url),'utf8'));
const originSpecs=[
  {name:'js-sequence-diagrams',version:'27c7a2b4fcb7b3366b9e371fde18911e08b13054',file:'sequence-BSD.txt',license:'BSD-2-Clause'},
  {name:'Jekyll',version:'6dd3cc21c40b98054851846425af06c64f9fb466',file:'jekyll-MIT.txt',license:'MIT'}
];
for(const spec of originSpecs){
  const records=origins.sources.filter(source=>source.name===spec.file);
  if(records.length!==1||!records[0].url.includes('/'+spec.version+'/'))throw Error('origin record mismatch');
  const bytes=await readFile(path.join(originsDirectory,spec.file));
  if(bytes.length!==records[0].bytes||sha(bytes)!==records[0].sha256)throw Error('origin original mismatch');
  all.push({name:spec.name,version:spec.version,license:spec.license,referenceOnly:true,originals:[{name:spec.file,bytes,sha256:records[0].sha256}],patched:false,blocks:[]});
}
const escape=s=>String(s??'申告なし').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await mkdir(target);const rows=[];const manifest=[];
for(let i=0;i<all.length;i++){
  const pkg=all[i],links=[];
  for(let j=0;j<pkg.originals.length;j++){
    const item=pkg.originals[j],filename=`original-${String(i).padStart(3,'0')}-${j}.txt`;
    await writeFile(path.join(target,filename),item.bytes,{flag:'wx'});
    links.push(`<a href="./${filename}">${escape(item.name)}</a>`);
    manifest.push({path:'/licenses/'+filename,name:pkg.name,version:pkg.version,sourceName:item.name,sha256:item.sha256,referenceOnly:pkg.referenceOnly===true});
  }
  rows.push(`<li><strong>${escape(pkg.name)} ${escape(pkg.version)}</strong> (${escape(pkg.license)})${pkg.patched?' [上流パッチあり]':''}${pkg.referenceOnly?' [由来ソースの原文候補・適用判断は保留]':''}: ${links.join(' / ')}</li>`);
}
const notices=all.filter(pkg=>pkg.blocks.length).map(pkg=>`${pkg.name}@${pkg.version}\n\n${pkg.blocks.join('\n\n')}`).join('\n\n---\n\n')+'\n';
await writeFile(path.join(target,'source-notices.txt'),notices,{flag:'wx'});
for(const spec of patchData)await writeFile(path.join(target,spec.file+'.txt'),spec.bytes,{flag:'wx'});
await writeFile(path.join(target,'generator-license.txt'),generatorOriginal,{flag:'wx'});
const patchLinks=patchData.map(spec=>`<li>${escape(spec.package)}: ${escape(spec.explanation)} <a href="./${spec.file}.txt">上流パッチ原文</a></li>`).join('');
const html='<!doctype html><html lang="ja"><meta charset="utf-8"><title>第三者ライセンス候補</title><body><h1>第三者ライセンス原文候補</h1><p>隔離PoC用の候補一覧です。配布条件の充足や正式公開を示すものではありません。DOMPurifyはApache-2.0選択案で両原文を保持します。</p><p><a href="./source-notices.txt">出力に寄与したファイルの表示候補</a></p><h2>生成器の参考原文</h2><p>langium-cli 4.4.0（MIT）。parserの生成テンプレートの由来を確認する参考資料です。実行時に同梱された依存の一覧とは区別します。<a href="./generator-license.txt">生成器MIT原文</a></p><h2>上流で適用された変更</h2><ul class="patches">'+patchLinks+'</ul><h2>ライセンス原文</h2><ul class="originals">'+rows.join('\n')+'</ul></body></html>';
await writeFile(path.join(target,'index.html'),html,{flag:'wx'});
await writeFile(path.join(target,'manifest.json'),JSON.stringify({items:manifest,sourceNotices:{path:'/licenses/source-notices.txt',sha256:sha(Buffer.from(notices))},generatorReference:{name:generatorPackage.name,version:generatorPackage.version,path:'/licenses/generator-license.txt',sha256:sha(generatorOriginal),role:'generator reference, not runtime contributor'},patches:patchData.map(({package:name,file,sha256})=>({name,path:'/licenses/'+file+'.txt',sha256}))},null,2)+'\n',{flag:'wx'});
const indexPath=path.join(dist,'index.html');const index=await readFile(indexPath,'utf8');
if(!index.includes('</body>'))throw Error('missing index body');
await writeFile(indexPath,index.replace('</body>','<p><a href="/licenses/index.html">第三者ライセンス原文候補</a></p></body>'));
console.log(JSON.stringify({entries:all.length,originals:manifest.length,sourceOriginCandidates:all.filter(x=>x.referenceOnly).length,patched:all.filter(x=>x.patched).map(x=>x.name)}));
const {writeSw}=await import('./write-sw.mjs');await writeSw(dist);
