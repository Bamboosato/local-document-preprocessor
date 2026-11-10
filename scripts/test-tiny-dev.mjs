import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Reuse the product's CSP/SVG/source case against an actual development server.
execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/@playwright/test/cli.js',import.meta.url)),'test','tests/e2e/json.spec.ts','--grep','JSON Mermaid uses','--workers=1'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true,
  env:{...process.env,PLAYWRIGHT_DEV:'true',PLAYWRIGHT_PORT:process.env.PLAYWRIGHT_PORT||'4175'},
});
