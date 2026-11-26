import {copyDistributionConditionMaterials} from './distribution-condition-materials.mjs';
import {copyMmOriginMaterials} from './mm-origin-materials.mjs';
import { copyFile, mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {copyTinyMaterials} from './tiny-materials.mjs';
import {verifyPakoMaterials} from './pako-materials.mjs';
import {verifyInternalNotices} from './internal-notices.mjs';
import {copyWasmDataMaterials} from './wasm-data-materials.mjs';
import {copyPdfiumNoticeMaterials} from './pdfium-notice-materials.mjs';

const projectRoot = new URL('../', import.meta.url);
const outputDirectory = new URL(
  process.argv.includes('--local-mcp') ? 'tools/local-mcp/dist/licenses/' : 'dist/licenses/',
  projectRoot,
);
const licenses = [
  ['node_modules/@firecrawl/anydoc-wasm/LICENSE', 'anydoc-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE', 'embedpdf-pdfium-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE.pdfium', 'PDFium-LICENSE.txt'],
  ['node_modules/fflate/LICENSE', 'fflate-MIT.txt'],
  ['node_modules/pdf-lib/LICENSE.md', 'pdf-lib-MIT.txt'],
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  licenses.map(([source, destination]) =>
    copyFile(new URL(source, projectRoot), new URL(destination, outputDirectory)),
  ),
);

console.log(
  `Copied ${licenses.length} third-party license files to ${fileURLToPath(outputDirectory)}`,
);

// Conservative source-package inventory, not a linked WASM SBOM.
const lock=JSON.parse(await readFile(new URL('package-lock.json',projectRoot),'utf8'));
const packages=[];
const pako=await verifyPakoMaterials();
const internal=await verifyInternalNotices();
for(const [path,meta] of Object.entries(lock.packages)){
  if(!path||meta.dev)continue;
  const dir=new URL(path+'/',projectRoot),pkg=JSON.parse(await readFile(new URL('package.json',dir),'utf8'));
  if(pkg.version!==meta.version)throw new Error('production-license-version-mismatch');
  const names=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&/^(licen[sc]e|copying|notice|copyright)([._-]|$)/i.test(e.name)&&!/\.(?:[cm]?js|ts)$/i.test(e.name)).map(e=>e.name);
  if(!names.length||!meta.integrity||!meta.resolved)throw new Error('production-license-missing');
  const originals=[];
  for(const name of names){const bytes=await readFile(new URL(name,dir));const relative=`dependencies/${pkg.name.replaceAll('/','__')}@${pkg.version}/${name}`;const target=new URL(relative,outputDirectory);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,bytes);originals.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex')});}
  if(pkg.name==='pako'){
    const target=new URL(pako.path,outputDirectory);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,pako.bytes);
    originals.push({path:pako.path,sha256:pako.sha256});
  }
  if(pkg.name===internal.record.name){
    for(const file of internal.files){
      const target=new URL(file.outputPath,outputDirectory);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,file.bytes);
      originals.push({path:file.outputPath,sha256:file.sha256,...(file.role?{role:file.role}:{})});
    }
  }
  packages.push({name:pkg.name,version:pkg.version,lockPath:path,license:pkg.license??meta.license??null,tarball:meta.resolved,integrity:meta.integrity,originals});
}
// Conservatively retain originals for reviewed WASM candidates (including AND).
// Their presence does not establish that either crate is linked into the WASM.
const evidence=JSON.parse(await readFile(new URL('docs/evidence/json-anydoc-target-licenses.json',projectRoot),'utf8'));
const candidateSpecs=[
  {name:'encoding_rs',version:'0.8.35',license:'(Apache-2.0 OR MIT) AND BSD-3-Clause',names:['COPYRIGHT','LICENSE-APACHE','LICENSE-MIT','LICENSE-WHATWG']},
  {name:'unicode-ident',version:'1.0.24',license:'(MIT OR Apache-2.0) AND Unicode-3.0',names:['LICENSE-APACHE','LICENSE-MIT','LICENSE-UNICODE']},
  {name:'zlib-rs',version:'0.6.6',license:'Zlib',names:['LICENSE']},
];
if(evidence.source?.commit!=='4a45addbd607e8b59f0c263bca26aab228e10370'||lock.packages['node_modules/@firecrawl/anydoc-wasm']?.version!=='0.1.7')throw new Error('wasm-candidate-source-mismatch');
const wasmCandidates=[];
for(const spec of candidateSpecs){
  const matches=evidence.packages.filter(pkg=>pkg.name===spec.name&&pkg.version===spec.version);
  if(matches.length!==1)throw new Error('wasm-candidate-version-mismatch');
  const pkg=matches[0];
  if(pkg.declaredLicense!==spec.license||pkg.originals.length!==spec.names.length)throw new Error('wasm-candidate-count-or-license-mismatch');
  const originals=[];
  for(const name of spec.names){
    const found=pkg.originals.filter(original=>original.path===`licenses/${spec.name}@${spec.version}/${name}`);
    if(found.length!==1)throw new Error('wasm-candidate-original-mismatch');
    const original=found[0],prefix=`docs/third-party-source-licenses/anydoc/${spec.name}@${spec.version}/`;
    if(!original.reviewPath.startsWith(prefix)||original.reviewPath.slice(prefix.length).includes('/')||original.reviewPath.includes('..'))throw new Error('wasm-candidate-unsafe-path');
    const bytes=await readFile(new URL(original.reviewPath,projectRoot));
    if(bytes.length!==original.bytes||createHash('sha256').update(bytes).digest('hex')!==original.sha256)throw new Error('wasm-candidate-hash-mismatch');
    const path=`wasm-candidates/anydoc/${spec.name}@${spec.version}/${name}`;
    await mkdir(new URL(path.slice(0,path.lastIndexOf('/')+1),outputDirectory),{recursive:true});
    await writeFile(new URL(path,outputDirectory),bytes);
    originals.push({path,sha256:original.sha256,bytes:bytes.length});
  }
  wasmCandidates.push({name:spec.name,version:spec.version,declaredLicense:pkg.declaredLicense,originals});
}
const embeddedTiny=await copyTinyMaterials(outputDirectory);
const conditionPreparation=await copyDistributionConditionMaterials(outputDirectory);
const mmFontOrigin=await copyMmOriginMaterials(outputDirectory);
const confirmedWasmData=await copyWasmDataMaterials(outputDirectory);
const pdfiumNoticeCandidates=await copyPdfiumNoticeMaterials(outputDirectory);
await writeFile(new URL('inventory.json',outputDirectory),JSON.stringify({scope:'all root production npm packages; not linked WASM SBOM or distribution approval',packages,wasmCandidates,embeddedTiny,pdfiumNoticeCandidates,confirmedWasmData,mmFontOrigin,conditionPreparation},null,2));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const links=packages.map(pkg=>`<li><strong>${escapeHtml(pkg.name)} ${escapeHtml(pkg.version)}</strong> (${escapeHtml(pkg.license??'未記載')})${pkg.name==='dompurify'?' <span>選択したライセンス: Apache-2.0</span>':''} <ul>${pkg.originals.map(original=>`<li><a href="${original.path.split('/').map(segment=>encodeURIComponent(segment).replace(/%40/gi,'@')).join('/')}">${escapeHtml(original.path.split('/').at(-1))}</a>${original.role==='fixed-pdf-lib-cited-commits'?' <span>（固定参照commitの原文）</span>':original.role?.includes('unproven')?' <span>（参考候補・実借用版は未特定）</span>':''}</li>`).join('')}</ul></li>`).join('\n');
const candidateLinks=wasmCandidates.map(pkg=>`<li><strong>${escapeHtml(pkg.name)} ${escapeHtml(pkg.version)}</strong> (${escapeHtml(pkg.declaredLicense)})<ul>${pkg.originals.map(original=>`<li><a href="${original.path.split('/').map(segment=>encodeURIComponent(segment).replace(/%40/gi,'@')).join('/')}">${escapeHtml(original.path.split('/').at(-1))}</a>${original.role==='fixed-pdf-lib-cited-commits'?' <span>（固定参照commitの原文）</span>':original.role?.includes('unproven')?' <span>（参考候補・実借用版は未特定）</span>':''}</li>`).join('')}</ul></li>`).join('\n');
const pdfiumLinks=pdfiumNoticeCandidates.groups.map(group=>`<li><strong>${escapeHtml(group.name)}</strong><ul>${group.originals.map(original=>`<li><a href="${original.path.split('/').map(encodeURIComponent).join('/')}">${escapeHtml(original.path.split('/').at(-1))}</a></li>`).join('')}</ul></li>`).join('');
const conditionLinks=conditionPreparation.units.map(unit=>`<details><summary>${escapeHtml(unit.id)}</summary><p>原文の条件式: ${escapeHtml(unit.declaredExpression??'原文参照')}</p><p>準備条件: ${escapeHtml(unit.preparationChoice)}</p><ul>${unit.requirements.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul><ul>${unit.originals.map(f=>`<li><a href="${f.path.split('/').map(encodeURIComponent).join('/')}">${escapeHtml(f.label)}</a></li>`).join('')}</ul></details>`).join('');
const mmOriginLinks=mmFontOrigin.originals.map(f=>`<li><a href="${f.path}">${escapeHtml(f.label)}</a></li>`).join('');
const dataLinks=confirmedWasmData.originals.map(f=>`<li><a href="${f.path}">${escapeHtml(f.label)}</a></li>`).join('');
await writeFile(new URL('index.html',outputDirectory),`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>第三者ライセンス</title>
</head>
<body>
  <h1>第三者ライセンス</h1>
  <p>このアプリで使用する第三者のソフトウェアやデータのライセンス原文、著作権表示、出典を掲載しています。</p>
  <h2>公開しているライセンス原文と権利表示</h2>
  <h3>アプリが使用するパッケージ</h3>
  <p>pakoはMITとZlibの両条件を適用し、移植元・権利表示・変更説明も提供しています。</p>
  <p>pdf-libはMIT原文に加え、移植・借用箇所の権利表示とApache-2.0原文を掲載しています。base64とPDF.jsの原文には参考資料であることを示しています。</p>
  <p>アプリ配信時のJavaScriptは結合・最適化・圧縮しています。Tinyの公開JavaScriptは無改変で掲載しています。</p>
  <p><a href="inventory.json">機械可読の一覧</a></p>
  <ul>${links}</ul>
  <h3>Tinyに含まれる第三者の原文・権利表示</h3>
  <p><a href="mermaid-tiny/index.html">Tiny ${escapeHtml(embeddedTiny.version)} 内包物のライセンス・由来・変更</a></p>
  <h3>WASM内のデータと権利表示</h3>
  <p>配信ファイルとのデータの一致を確認できた範囲の権利表示です。PDFiumのフォント原文に記載されたBSD系条件は<a href="PDFium-LICENSE.txt">PDFiumの原文</a>で確認できます。</p>
  <ul>${dataLinks}</ul>
  <h2>参考資料</h2>
  <p>配信ファイルへの収録や適用条件を確認するために参照した原文と、条件ごとの表示案を掲載しています。</p>
  <h3>MMフォント初出時の参考原文</h3>
  <p>MMフォントが最初に収録された時点の原文です。</p>
  <ul>${mmOriginLinks}</ul>
  <h3>WASM 依存候補の原文</h3>
  <p>配信しているWASMに含まれるか未確認の依存候補です。</p>
  <ul>${candidateLinks}</ul>
  <h3>PDFiumの依存候補と貢献表示案</h3>
  <p>対象版のソースコードと依存関係の定義をもとに収集した原文と、条件ごとの表示案です。</p>
  <ul>${pdfiumLinks}</ul>
  <p><a href="${escapeHtml(pdfiumNoticeCandidates.credits.path)}">条件付き貢献表示案</a></p>
  <h3>依存候補のライセンス原文と条件別の告知案</h3>
  <p><a href="${conditionPreparation.credits.path}">依存候補の貢献表示案</a></p>
  ${conditionLinks}
  <h2>未確認の点</h2>
  <ul>
    <li>pdf-libのbase64とPDF.jsについて、実際に借用された版や適用範囲は未確定です。</li>
    <li>配信しているWASMについて、実際に含まれる依存の全体と各配布条件の充足は未確認です。</li>
    <li>PDFiumのMMフォントについて、初出以前の文字の輪郭の由来、Adobeの著作権表示に関係する許諾範囲、元コードの表示・変更に関する条件は未確定です。</li>
  </ul>
</body>
</html>
`);
console.log(`Collected ${packages.length} root production package originals`);
