import { copyFile, mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);
const outputDirectory = new URL('dist/licenses/', projectRoot);
const licenses = [
  ['node_modules/@firecrawl/anydoc-wasm/LICENSE', 'anydoc-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE', 'embedpdf-pdfium-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE.pdfium', 'PDFium-Apache-2.0.txt'],
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
for(const [path,meta] of Object.entries(lock.packages)){
  if(!path||meta.dev)continue;
  const dir=new URL(path+'/',projectRoot),pkg=JSON.parse(await readFile(new URL('package.json',dir),'utf8'));
  if(pkg.version!==meta.version)throw new Error('production-license-version-mismatch');
  const names=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&/^(licen[sc]e|copying|notice|copyright)([._-]|$)/i.test(e.name)&&!/\.(?:[cm]?js|ts)$/i.test(e.name)).map(e=>e.name);
  if(!names.length||!meta.integrity||!meta.resolved)throw new Error('production-license-missing');
  const originals=[];
  for(const name of names){const bytes=await readFile(new URL(name,dir));const relative=`dependencies/${pkg.name.replaceAll('/','__')}@${pkg.version}/${name}`;const target=new URL(relative,outputDirectory);await mkdir(new URL('.',target),{recursive:true});await writeFile(target,bytes);originals.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex')});}
  packages.push({name:pkg.name,version:pkg.version,lockPath:path,license:pkg.license??meta.license??null,tarball:meta.resolved,integrity:meta.integrity,originals});
}
await writeFile(new URL('inventory.json',outputDirectory),JSON.stringify({scope:'all root production npm packages; not linked WASM SBOM or distribution approval',packages},null,2));
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const links=packages.map(pkg=>`<li><strong>${escapeHtml(pkg.name)} ${escapeHtml(pkg.version)}</strong> (${escapeHtml(pkg.license??'未記載')})${pkg.name==='dompurify'?' <span>選択したライセンス: Apache-2.0</span>':''} <ul>${pkg.originals.map(original=>`<li><a href="${original.path.split('/').map(segment=>encodeURIComponent(segment).replace(/%40/gi,'@')).join('/')}">${escapeHtml(original.path.split('/').at(-1))}</a></li>`).join('')}</ul></li>`).join('\n');
await writeFile(new URL('index.html',outputDirectory),`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>第三者ライセンス</title></head><body><h1>第三者ライセンス</h1><p>本番npm依存から収集した原文です。WASMの内包物一覧を保証するものではありません。</p><p><a href="inventory.json">機械可読の一覧</a></p><ul>${links}</ul></body></html>\n`);
console.log(`Collected ${packages.length} root production package originals`);
