import './standard.css';
import {parseBytes,generate} from './core.mjs';
import {createStandardView} from './standard-view.mjs';
import {sanitizeStandardSvg,renderStandard,utf8Bytes,DISPLAY_LIMIT_BYTES} from './standard-renderer.mjs';
const input=document.querySelector('#standard-input');
const view=createStandardView(document.querySelector('#standard-view'));
const make=text=>generate(parseBytes(new TextEncoder().encode(text)),'','mermaid','fixture.json');
document.querySelector('#standard-convert').onclick=async()=>{
  view.clear();try{await view.show(make(input.value));}catch{document.querySelector('#standard-status').textContent='JSONを変換できませんでした。入力と上限を確認してください。';}
};
document.querySelector('#standard-clear').onclick=()=>{input.value='';view.clear();};
// Test harness accepts synthetic fixtures only; no persistence, network or export sink.
window.standard={view,make,testing:{createStandardView,sanitizeStandardSvg,renderStandard,utf8Bytes,DISPLAY_LIMIT_BYTES}};
