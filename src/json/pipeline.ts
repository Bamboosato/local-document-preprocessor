import {children,encodeSegment,generate,literal,resolve,valueText,type JsonModel} from './core.mjs';
import type {JsonSettings,JsonPage} from './contracts';
import type {ConversionResult} from '../converter/contracts';
import {markdownToPlainText} from '../plainText/markdownToPlainText';
function excerpt(value:string){let out='',count=0;for(const cp of value){if(++count>100)return out+'…';out+=cp;}return out;}

export function browseJson(model:JsonModel,settings:JsonSettings,offset=0):JsonPage {
  const node=resolve(model,settings.pointer);
  const descendants=children(node);
  if(!Number.isInteger(offset)||offset<0)throw new Error('offset');
  let valid=true,reason;
  try{generate(model,settings.pointer,settings.style,'fixture.json');}catch(error){valid=false;reason=error instanceof Error?error.message:'invalid';}
  return {pointer:settings.pointer,type:node.type,total:descendants.length,offset,valid,reason,
    rows:descendants.slice(offset,offset+300).map(({key,node:child})=>({pointer:settings.pointer+'/'+encodeSegment(key),name:literal(excerpt(key)),type:child.type,container:['object','array'].includes(child.type),preview:child.type==='string'?literal(excerpt(String(child.value))):excerpt(valueText(model,child))}))};
}
export async function convertJson(model:JsonModel,settings:JsonSettings,fileName:string,validate:(code:string)=>Promise<void>):Promise<ConversionResult> {
  const generated=generate(model,settings.pointer,settings.style,fileName);
  if(generated.code)await validate(generated.code);
  return {markdown:generated.markdown,plainText:markdownToPlainText(generated.markdown),detectedFormat:'JSON',
    jsonDiagram:generated.code?{code:generated.code}:undefined,
    quality:{reviewRequired:true,disposition:'success',safeToExport:true,extractionSource:'json',outputCharacterCount:generated.markdown.replace(/\s/g,'').length,
      issues:[{code:'sourceComparisonRequired',severity:'warning',message:'JSONの対象・値・出力スタイルを原本と照合してください。'}]}};
}
