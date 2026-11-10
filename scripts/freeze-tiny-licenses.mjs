// Maintenance step: promote only the reviewed active candidate, without network access.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {readTinyRelease,digest} from './tiny-release.mjs';
const root=new URL('../',import.meta.url),release=await readTinyRelease();
const source=new URL(release.candidateDirectory,root),output=new URL(release.snapshotDirectory,root);
const reviewedBytes=await readFile(new URL(release.reviewedMaterials,root));
if(digest(reviewedBytes)!==release.reviewedMaterialsSha256)throw Error('reviewed material record changed');
const reviewed=JSON.parse(reviewedBytes),expected=reviewed.candidateAssetHashes;
if(reviewed.sourceCommit!==release.sourceCommit||reviewed.bundleSha256!==release.bundleSha256||reviewed.candidateOriginals!==release.originals||reviewed.candidateLicenseAssets!==release.materialCount)throw Error('candidate material identity mismatch');
const files=(await readdir(source)).sort();
if(JSON.stringify(files)!==JSON.stringify(Object.keys(expected).sort()))throw Error('candidate material inventory mismatch');
const prepared=[];
for(const name of files){
  let bytes=await readFile(new URL(name,source));
  if(digest(bytes)!==expected[name])throw Error('reviewed material changed');
  if(name==='index.html'){
    const old='隔離PoC用の候補一覧です。配布条件の充足や正式公開を示すものではありません。DOMPurifyはApache-2.0選択案で両原文を保持します。';
    if(!bytes.toString('utf8').includes(old))throw Error('candidate index wording changed');
    bytes=Buffer.from(bytes.toString('utf8')
      .replaceAll('第三者ライセンス候補','Tiny内包物の第三者ライセンス')
      .replaceAll('第三者ライセンス原文候補','Tiny内包物の第三者ライセンス原文')
      .replace(old,`Tiny ${release.version}に関する原文・権利表示と上流の変更を提供します。DOMPurifyはApache-2.0を選択し、両原文を保持します。`)
      .replace('出力に寄与したファイルの表示候補','取り込んだファイルの権利表示')
      .replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'));
  }
  if(name==='manifest.json')bytes=Buffer.from(bytes.toString('utf8').replaceAll('/licenses/','/licenses/mermaid-tiny/'));
  prepared.push({name,bytes});
}
await mkdir(output);
for(const {name,bytes} of prepared)await writeFile(new URL(name,output),bytes,{flag:'wx'});
const record={schema:1,name:release.name,version:release.version,bundleSha256:release.bundleSha256,sourceCommit:release.sourceCommit,reviewedMaterialRecordSha256:digest(reviewedBytes),sourceAssetHashes:expected,files:prepared.map(({name,bytes})=>({name,bytes:bytes.length,sha256:digest(bytes)})),scope:'Product notice snapshot promoted from reviewed candidate; original bytes preserved. Index wording and manifest URLs adapted for product path. Not public-release approval.'};
await writeFile(new URL(release.productRecord,root),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({version:release.version,snapshotFiles:prepared.length,originals:release.originals}));
