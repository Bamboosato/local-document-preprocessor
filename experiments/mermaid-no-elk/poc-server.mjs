import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const csp="default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
export async function startServer(directory,override=()=>undefined){
  const server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!/^\/(?:index\.html|tiny\.js|worker\.js|sw\.js|assets\/[\w.-]+\.js|licenses\/(?:index\.html|manifest\.json|[\w.-]+\.txt))?$/.test(pathname))throw Error('unknown');
    const name=pathname==='/'?'index.html':pathname.slice(1);
    res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.txt')?'text/plain':'text/javascript');
    res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store');
    const replacement=await override(pathname);
    res.end(replacement??await readFile(path.join(typeof directory==='function'?directory():directory,name)));
  }catch{res.statusCode=404;res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {origin:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
