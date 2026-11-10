// Diagnostic only: the root Mermaid dependency is not a candidate for distribution.
import mermaid from 'mermaid';
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,suppressErrorRendering:true});
try {
  await mermaid.parse('flowchart TD\n A["x"] --> B["y"]');
  console.log(JSON.stringify({control:'root-mermaid-12.2.0',parse:true}));
} catch (error) {
  console.log(JSON.stringify({control:'root-mermaid-12.2.0',parse:false,error:String(error)}));
  process.exitCode=1;
}
