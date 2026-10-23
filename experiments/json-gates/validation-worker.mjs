import mermaid from 'mermaid';
import {mermaidConfig} from './mermaid-config.mjs';
mermaid.initialize(mermaidConfig);
self.onmessage=async event=>{
  try {if(Array.from(event.data.code).length>50000)throw new Error('code-limit');await mermaid.parse(event.data.code);self.postMessage({nonce:event.data.nonce,valid:true});}
  catch(error) {self.postMessage({nonce:event.data.nonce,valid:false,reason:['DOMPurify','document','window','sanitize','addHook'].find(word=>String(error.message).includes(word))??error.name});}
};
