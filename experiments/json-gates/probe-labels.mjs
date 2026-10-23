import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(20000);await page.goto('http://127.0.0.1:4187');await page.waitForFunction(()=>window.gates);
 for(const [id,label,expected] of [['metadata',null,'"A"'],['named','#quot;A#quot;','"A"'],['numeric','#34;A#34;','"A"'],['html','&quot;A&quot;','"A"'],['literal','A 9007199254740993','A 9007199254740993']]){
  const result=await page.evaluate(async({label,expected})=>{
   const valid=await gates.diagram.show({code:label===null?`flowchart TD\nn0@{ shape: rect, label: '\"A\"' }\n`:`flowchart TD\nn0["${label}"]\n`});
   if(!valid)return {validated:false};
   const end=performance.now()+12000;while(!['rendered','display-failed','render-timeout'].includes(gates.diagram.state().status)&&performance.now()<end)await new Promise(r=>setTimeout(r,20));
   const state=gates.diagram.state();return {status:state.status,matches:state.details?.labels?.[0]===expected,entityLiteral:state.details?.labels?.[0]?.includes('&#'),observedLength:state.details?.labels?.[0]?.length};
  },{label,expected});console.log(id+' '+JSON.stringify(result));
 }
}finally{await browser.close();}
