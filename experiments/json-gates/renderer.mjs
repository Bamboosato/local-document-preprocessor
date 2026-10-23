import mermaid from 'mermaid';
import {mermaidConfig} from './mermaid-config.mjs';
const nonce=new URL(location.href).hash.slice(1);
const send=data=>parent.postMessage({nonce,...data},'*');
mermaid.initialize(mermaidConfig);
window.onmessage=async event=>{
  if(event.source!==parent || event.data.nonce!==nonce)return;
  const {code,blockMilliseconds=0,operation='render'}=event.data;
  try {
    if(operation==='validate') {await mermaid.parse(code);send({kind:'validated'});return;}
    // A finite synthetic synchronous layout workload tests cancellation of the
    // chosen context itself, independent of one fast Mermaid fixture.
    const end=performance.now()+blockMilliseconds;
    while(performance.now()<end){}
    const {svg}=await mermaid.render('gateDiagram',code,document.getElementById('canvas'));
    const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
    const forbidden=parsed.querySelectorAll('parsererror,script,foreignObject,a,image,iframe,object,embed').length;
    let external=0;
    for(const el of parsed.querySelectorAll('*')) for(const attr of el.attributes) {
      if(attr.name.startsWith('xmlns'))continue;
      if(/^on/i.test(attr.name) || /javascript:|https?:\/\//i.test(attr.value) || ((attr.localName==='href')&&!attr.value.startsWith('#')))external++;
    }
    for(const style of parsed.querySelectorAll('style'))if(/@import|url\(\s*['"]?(?:https?:|\/\/|data:)/i.test(style.textContent))external++;
    if(forbidden||external){send({kind:'unsafe',forbidden,external});document.getElementById('canvas').replaceChildren();return;}
    document.getElementById('canvas').innerHTML=svg;
    const labels=[...document.querySelectorAll('.node .label')].map(el=>el.textContent);
    send({kind:'rendered',labels,nodeCount:document.querySelectorAll('.node').length,edgeCount:document.querySelectorAll('.edgePath,.edgePaths path.flowchart-link').length,forbidden,external});
  } catch {send({kind:'failed'});}
};
send({kind:'ready'});
