import mermaid from 'mermaid';
import {parseBytes,generate} from '../../src/json/core.mjs';
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,suppressErrorRendering:true});
try {
  const fixture=generate(parseBytes(new TextEncoder().encode('{"a":"x"}')),'','mermaid','fixture.json');
  await mermaid.parse(fixture.code);
  postMessage({parse:true});
} catch(error) { postMessage({parse:false,error:String(error)}); }
