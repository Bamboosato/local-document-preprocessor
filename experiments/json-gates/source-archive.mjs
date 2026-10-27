import {gunzipSync} from 'node:zlib';

const decoder=new TextDecoder('utf-8',{fatal:true});
const string=bytes=>decoder.decode(bytes).replace(/\0.*$/s,'');
export function safeArchivePath(value){
  if(!value||value.startsWith('/')||/[\\:%?#\x00-\x1f]/.test(value)||value.split('/').some(p=>p==='..'))throw new Error('unsafe-archive-path');
  if(value.split('/').some(p=>p&&p!=='.'&&(/[ .]$/.test(p)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))))throw new Error('unsafe-archive-path');
  return value.split('/').filter(p=>p&&p!=='.').join('/');
}
function pax(bytes){
  const fields={};let offset=0;
  while(offset<bytes.length){
    const space=bytes.indexOf(32,offset);if(space<0)throw new Error('invalid-pax');
    const length=Number(bytes.subarray(offset,space).toString('ascii'));
    if(!Number.isSafeInteger(length)||length<=space-offset+2||offset+length>bytes.length||bytes[offset+length-1]!==10)throw new Error('invalid-pax');
    const field=decoder.decode(bytes.subarray(space+1,offset+length-1)),equal=field.indexOf('=');if(equal<1)throw new Error('invalid-pax');
    fields[field.slice(0,equal)]=field.slice(equal+1);offset+=length;
  }return fields;
}
export function readTar(bytes,{maxEntries=25000,maxFileBytes=64*1024**2}={}){
  const entries=[],seen=new Set();let offset=0,count=0,longName,local={},global={},ended=false;
  while(offset+512<=bytes.length){
    const header=bytes.subarray(offset,offset+512);offset+=512;
    if(header.every(b=>b===0)){ended=true;break;}
    if(++count>maxEntries)throw new Error('archive-entry-limit');
    const octal=part=>{const s=string(part).trim();if(!/^[0-7]+$/.test(s))throw new Error('invalid-tar-number');return parseInt(s,8);};
    const size=octal(header.subarray(124,136)),stored=octal(header.subarray(148,156));
    let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:header[i];
    if(stored!==checksum)throw new Error('tar-checksum-mismatch');
    if(!Number.isSafeInteger(size)||size>maxFileBytes||offset+Math.ceil(size/512)*512>bytes.length)throw new Error('truncated-or-large-tar');
    const body=bytes.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;
    const type=String.fromCharCode(header[156]);
    if(type==='x'){local=pax(body);continue;}if(type==='g'){global={...global,...pax(body)};continue;}
    if(type==='L'){longName=string(body);continue;}
    const fields={...global,...local},prefix=string(header.subarray(345,500));
    if(fields.size!==undefined&&Number(fields.size)!==size)throw new Error('unsupported-pax-size');
    const name=safeArchivePath(fields.path??longName??((prefix?prefix+'/':'')+string(header.subarray(0,100))));
    local={};longName=undefined;
    if(type==='5')continue;
    if(type!=='0'&&type!=='\0')throw new Error('unsupported-archive-entry');
    if(!name||seen.has(name))throw new Error('duplicate-archive-entry');seen.add(name);
    entries.push({name,bytes:body});
  }
  if(!ended||!entries.length||Object.keys(local).length||longName)throw new Error('incomplete-archive');
  return entries;
}
export function readTarGzip(bytes){return readTar(gunzipSync(bytes,{maxOutputLength:256*1024**2}));}
export function licenseEntries(entries,licenseFile){
  const expected=licenseFile?safeArchivePath(licenseFile):null;
  return entries.filter(e=>/(^|\/)(licen[sc]es?|copying|notice|copyright|authors|patents)([^/]*)(\/|$)/i.test(e.name)||expected&&e.name===expected);
}
export function targetCandidates(tree,records){
  const known=new Map(records.map(p=>[p.name+'@'+p.version,p])),selected=new Map();
  for(const line of tree.split('\n').filter(l=>l.trim())){
    const match=/^([A-Za-z0-9_-]+) v([0-9A-Za-z.+-]+)(?: |\||$)/.exec(line);if(!match)throw new Error('unknown-cargo-tree-line');
    const [,name,version]=match,key=name+'@'+version;
    if(['anydoc','anydoc-wasm'].includes(name)){if(version!=='0.1.7')throw new Error('workspace-version-mismatch');continue;}
    const candidate=known.get(key);if(!candidate)throw new Error('target-not-in-fixed-lock');
    const features=(line.split('|')[1]??'').replace(/\s+\(\*\)$/,'').split(',').filter(Boolean).sort();
    selected.set(key,{...candidate,features:[...new Set([...(selected.get(key)?.features??[]),...features])].sort()});
  }
  if(!selected.size)throw new Error('empty-target-graph');
  return [...selected.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version));
}
