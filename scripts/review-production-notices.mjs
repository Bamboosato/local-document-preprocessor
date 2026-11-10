// Read-only discovery from installed fixed-lock packages, not a complete SBOM
// or a legal classifier. No dependency code is imported or executed.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),output=process.argv[2];
if(!output||!/^docs\/evidence\/[a-z0-9][a-z0-9.-]*\.json$/.test(output)||output.includes('..'))throw Error('Expected new docs/evidence output');
const hash=b=>createHash('sha256').update(b).digest('hex');
const lockBytes=await readFile(new URL('package-lock.json',root)),lock=JSON.parse(lockBytes),packages=[];
const noticeName=/^(?:licen[sc]e|copying|copyright|notice|authors)(?:[._-]|$)/i;
const textName=/\.(?:[cm]?js|jsx|tsx?|md|txt)$/i;
for(const [path,meta] of Object.entries(lock.packages)){
  if(!path||meta.dev)continue;
  const directory=new URL(path+'/',root),pkg=JSON.parse(await readFile(new URL('package.json',directory)));
  if(pkg.version!==meta.version||!meta.integrity)throw Error('Installed/locked package mismatch');
  const files=[];let skippedNestedDependencyDirectories=0;
  async function visit(relative=''){
    for(const entry of await readdir(new URL(relative,directory),{withFileTypes:true})){
      const name=relative+entry.name;
      if(entry.isDirectory()){
        if(entry.name==='node_modules'){skippedNestedDependencyDirectories++;continue;}
        await visit(name+'/');
      }else if(entry.isFile())files.push(name);
      else throw Error('Unexpected non-file package entry');
    }
  }
  await visit();files.sort();
  const inputs=[],internalMarkers=[],noticeFiles=[],skipped={nonSelected:0,overLimit:0};
  for(const name of files){
    const basename=name.split('/').at(-1),isNotice=noticeName.test(basename)&&!textName.test(basename.replace(/\.(?:md|txt)$/i,''));
    if(!isNotice&&!textName.test(name)){skipped.nonSelected++;continue;}
    const bytes=await readFile(new URL(name,directory));
    if(bytes.length>4_000_000){skipped.overLimit++;continue;}
    const item={path:name,bytes:bytes.length,sha256:hash(bytes)};inputs.push(item);
    if(isNotice)noticeFiles.push(item);
    const text=bytes.toString('utf8'),categories=[];
    if(/copyright\s*(?:\(c\)|©|\d)|(?:^|\n)\s*(?:\/\/|\/\*|\*)?\s*\(C\)\s*\d/i.test(text))categories.push('rights-marker');
    if(/@license|SPDX-License-Identifier/i.test(text))categories.push('license-marker');
    if(/borrow(?:s|ed)? from|adapted from|ported from|derived from|based on zlib/i.test(text))categories.push('origin-marker');
    if(categories.length&&!isNotice)internalMarkers.push({...item,categories});
  }
  packages.push({name:pkg.name,version:pkg.version,lockPath:path,declaredLicense:pkg.license??meta.license??null,integrity:meta.integrity,selectedFiles:inputs.length,selectedInputListSha256:hash(Buffer.from(JSON.stringify(inputs))),skipped,skippedNestedDependencyDirectories,noticeFiles,internalMarkers});
}
const result={schema:1,date:'2026-11-10',lockSha256:hash(lockBytes),scope:'Installed source-package discovery, not proof of runtime contribution, archive authenticity or complete notice coverage',selection:'JS/TS/MD/TXT and LICENSE/COPYING/COPYRIGHT/NOTICE/AUTHORS names; <=4000000 bytes each; nested node_modules handled only by separate lock entries',packages,summary:{packages:packages.length,selectedFiles:packages.reduce((n,p)=>n+p.selectedFiles,0),internalMarkedFiles:packages.reduce((n,p)=>n+p.internalMarkers.length,0),nestedNoticeFiles:packages.reduce((n,p)=>n+p.noticeFiles.filter(f=>f.path.includes('/')).length,0),overLimitFiles:packages.reduce((n,p)=>n+p.skipped.overLimit,0)}};
await writeFile(new URL(output,root),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.summary));
