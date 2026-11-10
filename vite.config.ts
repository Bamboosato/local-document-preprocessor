import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import tinyRelease from './scripts/tiny-release.json' with {type:'json'};

export default defineConfig({
  plugins: [react(),{name:'verify-fixed-tiny',buildStart(){
    const bytes=readFileSync(new URL('./node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js',import.meta.url));
    const pkg=JSON.parse(readFileSync(new URL('./node_modules/@mermaid-js/tiny/package.json',import.meta.url),'utf8'));
    if(pkg.name!==tinyRelease.name||pkg.version!==tinyRelease.version||bytes.length!==tinyRelease.bundleBytes||createHash('sha256').update(bytes).digest('hex')!==tinyRelease.bundleSha256)throw Error('fixed Tiny runtime mismatch');
  }}],
  // Research snapshots and package stores must not become app entrypoints or
  // occupy the development file watcher. Tiny is a finished URL asset.
  // Prebundle the lazy worker's parsers before first file input, so discovery
  // does not reload the page and discard that in-memory input.
  optimizeDeps: {entries:['index.html'],include:['jsonc-parser','unified','remark-parse','remark-gfm'],exclude:['@mermaid-js/tiny']},
  server: {watch:{ignored:['**/tmp/**','**/experiments/**']}},
  resolve: {
    // The package exposes a DOM decoder under the generic browser condition
    // and a DOM-free decoder for workers. Vite resolves the browser condition
    // while bundling workers, so pin the worker-safe implementation explicitly.
    alias: {
      'decode-named-character-reference': fileURLToPath(
        new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url),
      ),
    },
  },
  worker: {
    // JSON uses the unmodified Tiny IIFE via importScripts. Vite also inlines
    // converter imports into its worker bundle; mixed-WASM regression covers it.
    format: 'iife',
  },
  build: {
    target: 'es2022',
  },
  test: {
    // Avoid desktop fork fanout; physical/browser scripts also run serially.
    maxWorkers: 1,
    fileParallelism: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
