export const DISPLAY_LIMIT_BYTES=50*1024;
export const utf8Bytes=code=>new TextEncoder().encode(code).length;
let library,sequence=0,tail=Promise.resolve();
// Mermaid uses shared DOM state: serialize actual rendering across all views.
function load(){
  if(!library)library=import('mermaid').then(({default:mermaid})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:100000});
    return mermaid;
  }).catch(error=>{library=undefined;throw error;});
  return library;
}
export function sanitizeStandardSvg(svg){
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw new Error('invalid-svg');
  const allowed=new Set(['svg','g','path','rect','circle','ellipse','text','tspan','line','polyline','polygon','defs','marker','style','title','desc','clipPath','symbol','use']);
  // Mermaid's default theme includes keyframes. Preserve those rules while
  // rejecting imports/font-face/escaped CSS and all non-fragment URL targets.
  const unsafeCSS=value=>/\\|@(?!keyframes\b|-webkit-keyframes\b|media\b)|expression\s*\(|url\s*\(\s*(?!['"]?#)/i.test(value);
  for(const el of [doc.documentElement,...doc.querySelectorAll('*')]){
    if(!allowed.has(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg'){el.remove();continue;}
    if(el.localName==='style'&&unsafeCSS(el.textContent)){el.remove();continue;}
    for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim();
      if(name.startsWith('on')||name==='src'||name==='action'||name==='formaction'||name==='xml:base'||
        ((name==='href'||name==='xlink:href')&&!/^#[A-Za-z0-9_.:-]+$/.test(value))||
        ((name==='style'||/url\s*\(/i.test(value))&&unsafeCSS(value)))el.removeAttribute(attr.name);
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}
export function renderStandard(code){
  if(utf8Bytes(code)>DISPLAY_LIMIT_BYTES)return Promise.reject(new Error('display-limit'));
  const task=tail.then(async()=>{
    const mermaid=await load(),host=document.createElement('div');
    host.className='render-staging';document.body.append(host);
    try {const result=await mermaid.render('standard-'+(++sequence),code,host);return sanitizeStandardSvg(result.svg);}
    finally{host.remove();}
  });
  tail=task.catch(()=>{});return task;
}
