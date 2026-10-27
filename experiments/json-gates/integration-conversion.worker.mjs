import {AnyDocConverter} from '../../src/converter/AnyDocConverter.ts';
import {PdfiumTextExtractor} from '../../src/converter/PdfiumTextExtractor.ts';
import {generate,parseText} from './core.mjs';

// Synthetic fixtures only. Separate from the product client and its quality contract.
self.onmessage=async({data:q})=>{
  try{
    let result;
    if(q.operation==='pdf'){
      const bytes=new Uint8Array(q.bytes);
      const converted=await new AnyDocConverter().convert({fileName:'synthetic.pdf',bytes});
      const verified=await new PdfiumTextExtractor().extract(bytes);
      result={pdfConverted:true,hasOutput:converted.markdown.includes('Synthetic integration fixture'),verified:verified.pages.some(p=>p.includes('Synthetic integration fixture'))};
    }else if(q.operation==='json')result=generate(parseText(q.text),'','mermaid');
    else throw new Error('operation');
    self.postMessage({id:q.id,result});
  }catch{self.postMessage({id:q.id,error:true});}
};
