try {
  importScripts('/tiny.js');
  self.mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false});
  self.onmessage=async ({data})=>{
    try {await self.mermaid.parse(data);postMessage({loaded:true,parse:true});}
    catch(error){postMessage({loaded:true,parse:false,error:String(error)});}
  };
} catch (error) { postMessage({loaded:false, error:String(error)}); }
