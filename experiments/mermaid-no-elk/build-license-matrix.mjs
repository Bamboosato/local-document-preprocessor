import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [inventoryPath,auditPath,outputPath]=process.argv.slice(2);
if(!inventoryPath||!auditPath||!outputPath)throw Error('usage: node build-license-matrix.mjs INVENTORY AUDIT OUTPUT');
const sha=b=>createHash('sha256').update(b).digest('hex');
const inventoryBytes=await readFile(inventoryPath),auditBytes=await readFile(auditPath);
const inventory=JSON.parse(inventoryBytes),audit=JSON.parse(auditBytes);
if(audit.inventorySha256!==sha(inventoryBytes)||audit.bundleSha256!==inventory.bundleSha256)throw Error('evidence mismatch');
const preparationBytes=await readFile(new URL('../../docs/evidence/mermaid-tiny-prepared-materials-check.json',import.meta.url));
const preparation=JSON.parse(preparationBytes);
if(preparation.inventorySha256!==sha(inventoryBytes)||preparation.bundleSha256!==inventory.bundleSha256)throw Error('prepared evidence mismatch');
const seen=new Set(),rows=[];
for(const p of inventory.packages){
  const key=p.name+'@'+p.version;
  if(seen.has(key))throw Error('duplicate identity');seen.add(key);
  const hits=audit.packages.filter(x=>x.name===p.name&&x.version===p.version);
  if(hits.length!==1||!p.originals.length)throw Error('incomplete evidence: '+key);
  const item=hits[0];
  const checks=preparation.packages.filter(x=>x.name===p.name&&x.version===p.version);
  if(checks.length!==1||!checks[0].hashesMatch||!checks[0].clauseMarkersFound)throw Error('prepared originals not verified');
  const noticeCandidates=item.noticeFiles.filter(f=>/(^|\/)(notice|third[-_]?party)/i.test(f.path));
  const pending=['原文・権利表示の製品版への配置と到達性'];
  if(item.markedFiles.length)pending.push('寄与ファイルの権利表示が原文・表示に保持されるか個別照合');
  if(p.declaredLicense==='Apache-2.0'||p.name==='dompurify')pending.push('Apache-2.0の変更表示と該当NOTICEの有無を確認');
  if(p.patched)pending.push('上流パッチの変更内容と適用条件を確認');
  if(!p.declaredLicense)pending.push('manifest申告なしのため原文と対応版の適用を確認');
  if(noticeCandidates.length)pending.push('NOTICE等の原文・表示方法を確認');
  rows.push({name:p.name,version:p.version,declaredLicense:p.declaredLicense,originals:p.originals,contributingFiles:item.contributingFiles,markedFiles:item.markedFiles.length,noticeCandidates,patched:p.patched,requiredReview:pending,preparedOriginalsHashChecked:true,licenseTextMarkersChecked:true,status:'PoC資料準備確認済み。製品提供・最終版の条件照合は保留'});
}
const additionalSourceOrigins=[
  {name:'langium-cli',version:'4.4.0',role:'generator templates',condition:'MIT reference; retain generator attribution and original as a conservative preparation; review substantial template content in generated output',status:'参考原文をPoCへ配置・オフライン照合済み。生成器と実行時依存を区別し製品提供は保留'},
  {name:'Jekyll',commit:'6dd3cc21c40b98054851846425af06c64f9fb466',source:'src/diagram-api/regexes.ts',licenseUrl:'https://raw.githubusercontent.com/jekyll/jekyll/6dd3cc21c40b98054851846425af06c64f9fb466/LICENSE',condition:'MIT; adapted Ruby frontmatter regex to JS anchors, indentation backreference, delimiters and dotAll; retain source copyright and permission original',status:'保留: 原文候補のPoCオフライン提供確認済み、最終適用・製品同梱未完'},
  {name:'js-sequence-diagrams',sourceCandidateCommit:'27c7a2b4fcb7b3366b9e371fde18911e08b13054',mermaidImportCommit:'2a0a2a2269545a26abf20c92de65f214eea5a425',source:'src/diagrams/sequence/parser/sequenceDiagram.jison',licenseUrl:'https://raw.githubusercontent.com/bramp/js-sequence-diagrams/27c7a2b4fcb7b3366b9e371fde18911e08b13054/LICENCE',condition:'Historical source and BSD-2-Clause original carry matching 2012-2013 Andrew Brampton attribution; adapted import differs in 10 line-change blocks; unique originating checkout not proven',status:'保留: 当時原文候補のPoCオフライン提供確認済み、製品同梱と最終適用判定未完'}
];
const result={bundleSha256:inventory.bundleSha256,inventorySha256:sha(inventoryBytes),noticeAuditSha256:sha(auditBytes),preparedMaterialsSha256:sha(preparationBytes),scope:'Fixed Tiny bundle and parser contributor candidates; PoC material verification is separate from product distribution and legal applicability.',workspace:inventory.workspace,packages:rows,additionalSourceOrigins};
await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({packages:rows.length,markedPackages:rows.filter(x=>x.markedFiles).length,patched:rows.filter(x=>x.patched).map(x=>x.name),noticeCandidates:rows.filter(x=>x.noticeCandidates.length).length,preparedOriginalsVerified:true,productDecision:'pending'}));
