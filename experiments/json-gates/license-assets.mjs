import {readFile,readdir} from 'node:fs/promises';

// Conservative inventory: all fixed prototype production dependencies, including
// packages the Mermaid validator bundle may load. Build-time files only.
export async function collectLicenseAssets(root){
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  const assets=[],packages=[];
  for(const [lockPath,meta] of Object.entries(lock.packages)){
    if(!lockPath||meta.dev)continue;
    const directory=new URL(lockPath+'/',root);
    const pkg=JSON.parse(await readFile(new URL('package.json',directory),'utf8'));
    const names=(await readdir(directory,{withFileTypes:true})).filter(e=>e.isFile()&&/^(licen[sc]e|copying|notice|copyright)(\.|$)/i.test(e.name)).map(e=>e.name).sort();
    if(!names.length||!meta.resolved||!meta.integrity)throw new Error('license-evidence-missing');
    const notices=[];
    for(const name of names){
      const fileName=`licenses/${pkg.name.replaceAll('/','__')}@${pkg.version}/${name}`;
      const source=await readFile(new URL(name,directory));
      if(!source.length)throw new Error('license-evidence-empty');
      assets.push({type:'asset',fileName,source});notices.push(fileName);
    }
    packages.push({name:pkg.name,version:pkg.version,license:pkg.license??meta.license??null,licenseMetadata:pkg.license?'package-json':meta.license?'lockfile':'not-declared-original-included',lockPath,sourcePackage:meta.resolved,integrity:meta.integrity,repository:pkg.repository??null,notices});
  }
  assets.push({type:'asset',fileName:'licenses/index.json',source:JSON.stringify({scope:'all prototype production dependencies; build-time inventory',packages},null,2)});
  return assets;
}
