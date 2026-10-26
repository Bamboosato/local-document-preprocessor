import {createWorkerDiagramController} from './diagram-worker-host.mjs';

// No text fetch, Blob/data URL, executable document interpolation or fallback.
const diagram=createWorkerDiagramController(document.querySelector('#diagram'),{
  workerLoader:async url=>{
    const absolute=new URL(url,location.href);
    if(absolute.origin!==location.origin||absolute.search||!/^\/assets\/[^/]+\.js$/.test(absolute.pathname))throw new Error('static-worker-only');
    return new Worker(absolute);
  },
});
window.readiness={diagram};
if(!new URL(location.href).searchParams.has('no-sw')){
  navigator.serviceWorker.register('/readiness-sw.js').then(async registration=>{
    await navigator.serviceWorker.ready;
    document.querySelector('#cache-status').textContent=registration.waiting?'更新待機（作業終了後に再読込）':'静的資産取得済み';
  }).catch(()=>{document.querySelector('#cache-status').textContent='資産を保存できません。オンラインでのみ検証できます。';});
}
