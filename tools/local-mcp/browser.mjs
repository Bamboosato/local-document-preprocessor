import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {failure} from './source.mjs';

const dist = new URL('./dist/', import.meta.url);
const entry = '/tools/local-mcp/engine.html';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.wasm':'application/wasm'};
export class BrowserEngine {
  async start(signal) {
    this.closed = false;
    const assets = new Set((await readdir(new URL('assets/', dist))).map(file => '/assets/' + file));
    signal.throwIfAborted();
    assets.add(entry);
    this.http = createServer(async (req,res) => {
      if (req.method !== 'GET' || req.headers.host !== this.origin?.host || !assets.has(req.url)) {
        res.writeHead(404).end(); return;
      }
      try {
        const bytes = await readFile(new URL(req.url.slice(1), dist));
        res.writeHead(200, {
          'Content-Type':mime[extname(req.url)],
          'Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'",
        }).end(bytes);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((resolve,reject) => this.http.once('error',reject).listen(0,'127.0.0.1',resolve));
    this.origin = new URL('http://127.0.0.1:' + this.http.address().port);
    signal.throwIfAborted();
    const browser = await chromium.launch({headless:true,timeout:20000}).catch(() => {
      throw failure('CONVERSION_FAILED','initializationFailed');
    });
    if (this.closed || signal.aborted) {
      await browser.close();
      throw failure('CANCELLED');
    }
    this.browser = browser;
    signal.throwIfAborted();
    const context = await this.browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    await context.route('**/*', route => new URL(route.request().url()).origin === this.origin.origin
      ? route.continue() : route.abort());
    this.page = await context.newPage();
    await this.page.goto(this.origin.origin + entry);
    await this.page.waitForFunction(() => !!window.ldpEngine, null, {timeout:10000});
  }
  async inspect(input,signal) {
    await this.start(signal);
    for (let pos=0; pos<input.bytes.length; pos+=256*1024) {
      signal.throwIfAborted();
      const chunk = input.bytes.subarray(pos,pos+256*1024).toString('base64');
      await this.page.evaluate(data => window.ldpEngine.append(data),chunk);
    }
    const result = await this.page.evaluate(name => window.ldpEngine.inspect(name),input.name);
    if (result.error) throw failure('CONVERSION_FAILED',result.error);
    return result.inspection;
  }
  async convert(args) {
    const result = await this.page.evaluate(input => window.ldpEngine.convert(input),args);
    if (result.error) throw failure(result.error === 'invalidSelection' ? 'INVALID_ARGUMENT' : 'CONVERSION_FAILED',result.error);
    if (!result.quality?.safeToExport || result.quality.disposition === 'failed' || !result.markdown?.trim()) {
      throw failure('CONVERSION_FAILED',undefined,result.quality);
    }
    return result;
  }
  async close() {
    this.closed = true;
    this.http?.closeAllConnections();
    this.http?.close();
    await this.browser?.close().catch(() => {});
  }
}
