import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ListRootsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {MAX_INPUT,failure,pipeName} from './source.mjs';

// Called by a host with its actual workspace and/or one authorized original.
export async function withLdp({workspace,attachment,signal},action) {
  const env = {};
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
  let pipe;
  const sockets = new Set();
  const client = new Client({name:'ldp-local-host',version:'0.1.0'}, {capabilities:workspace?{roots:{}}:{}});
  try {
    if (workspace) client.setRequestHandler(ListRootsRequestSchema,() => ({roots:[{uri:pathToFileURL(workspace).href}]}));
    if (attachment) {
      const {id,name,bytes} = attachment;
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_INPUT) throw failure('RESOURCE_LIMIT');
      const token = randomBytes(32).toString('hex');
      const address = randomUUID();
      pipe = createServer(socket => {
        sockets.add(socket);
        socket.on('close',() => sockets.delete(socket));
        socket.on('error',() => {});
        socket.setTimeout(5000,() => socket.destroy());
        let credentials = '';
        socket.on('data',part => {
          credentials += part.toString('ascii');
          if (!token.startsWith(credentials)) return socket.destroy();
          if (credentials === token) {
            socket.removeAllListeners('data');
            socket.end(bytes);
          }
        });
      });
      await new Promise((resolve,reject) => pipe.once('error',reject).listen(pipeName(address),resolve));
      Object.assign(env,{LDP_ATTACHMENT_ID:id,LDP_ATTACHMENT_NAME:name,LDP_ATTACHMENT_SIZE:String(bytes.length),
        LDP_ATTACHMENT_PIPE:address,LDP_ATTACHMENT_TOKEN:token,LDP_ATTACHMENT_SHA:createHash('sha256').update(bytes).digest('hex')});
    }
    const transport = new StdioClientTransport({command:process.execPath,
      args:[fileURLToPath(new URL('./server.mjs',import.meta.url))],env,stderr:'pipe'});
    await client.connect(transport);
    const call = async (name,args) => {
      const r = await client.callTool({name,arguments:args},undefined,{signal,timeout:150000});
      const payload = r.structuredContent;
      if (r.isError || !payload) throw failure(payload?.error?.code ?? 'INVALID_ARGUMENT',payload?.error?.reason,payload?.quality);
      return payload;
    };
    return await action(call,client);
  } finally {
    await client.close();
    for (const socket of sockets) socket.destroy();
    pipe?.close();
  }
}

export async function convert(call,source,options={}) {
  const doc = await call('inspect_document',{source});
  let part = await call('convert_document',{document_id:doc.document_id,...options});
  const {sha256,total_bytes,quality} = part;
  const chunks = [];
  let bytes = 0;
  for (;;) {
    if (part.document_id !== doc.document_id || part.sha256 !== sha256 || part.total_bytes !== total_bytes ||
        bytes !== part.offset_bytes || !part.markdown || !part.quality.safeToExport) throw failure('RESULT_MISMATCH');
    chunks.push(part.markdown);
    bytes += Buffer.byteLength(part.markdown);
    if (bytes > total_bytes) throw failure('RESULT_MISMATCH');
    if (part.next_cursor === null) break;
    part = await call('read_result',{cursor:part.next_cursor});
  }
  const markdown = chunks.join('');
  if (bytes !== total_bytes || createHash('sha256').update(markdown).digest('hex') !== sha256) throw failure('RESULT_MISMATCH');
  return {doc,quality,markdown,sha256};
}
function label(value) {
  return String(value).replace(/[\r\n\u2028\u2029]+/gu,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/([\\`*_{}\[\]()#+.!|~-])/gu,'\\$1');
}
export function noteInput(converted,options={},settings={}) {
  const {doc,quality,markdown} = converted;
  const s=options.selection;
  let selected='全体';
  if (s?.mode === 'range') selected=s.start+'～'+s.end+(doc.inspection.selectionKind==='slides'?'スライド':'ページ');
  if (s?.mode === 'sheets') selected=s.sheetNames.join('、');
  if (doc.inspection.json) {
    const json=options.json ?? {pointer:'',style:'items'};
    selected=(json.pointer || 'ルート')+' / '+json.style;
    if (json.diagramDirection) selected+=' / '+json.diagramDirection;
    if (json.arraySelection) selected+=' / '+JSON.stringify(json.arraySelection);
  }
  const title=(settings.title ?? (doc.file_name+(selected==='全体'?'':'（'+selected+'）'))).trim();
  const tags=settings.tags ?? [];
  if (!title || title.length>200 || tags.length>32 || tags.some(tag=>!tag.trim() || tag.trim().length>80)) throw failure('INVALID_ARGUMENT');
  const lines=['> 変換元：'+label(doc.file_name),'> 対象：'+label(selected),
    '> 品質：'+(quality.disposition==='partial'?'警告付き':'変換完了')+'（'+label(quality.extractionSource)+'）。原本と照合してください。',
    ...quality.issues.map(issue=>'> 警告：'+label(issue.message))];
  const body=lines.join('\n')+'\n\n'+markdown;
  if (Buffer.byteLength(body)>131072 || body.length>131072) throw failure('RESULT_TOO_LARGE',String(Buffer.byteLength(body)));
  return {request_id:settings.request_id ?? randomUUID(),title,tags,markdown:body};
}
