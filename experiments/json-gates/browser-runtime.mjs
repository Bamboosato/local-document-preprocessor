import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const baseline=process.env.PW_BASELINE==='1';
export const {chromium,firefox,webkit}=await import(baseline?'../../node_modules/@playwright/test/index.mjs':'@playwright/test');
export const playwrightVersion=require(baseline?'../../node_modules/@playwright/test/package.json':'@playwright/test/package.json').version;
