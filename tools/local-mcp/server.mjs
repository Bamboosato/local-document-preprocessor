import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {RootsListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {BrowserEngine} from './browser.mjs';
import {attachmentInput,projectInput,failure} from './source.mjs';

const mcp = new McpServer({name:'local-document-preprocessor',version:'0.1.0'},{
  instructions:'Use one connection per host workspace or attachment. A project file needs one file:// MCP root. For hosts without roots, or a file attached to chat by path, use the sibling run.mjs host adapter in the requesting workspace (see the local-mcp README). Use only the original explicitly selected by the user. Export only complete, verified Markdown with quality warnings.',
});
const source = z.discriminatedUnion('kind', [
  z.strictObject({kind:z.literal('project_file'),path:z.string().min(1).max(32767)}),
  z.strictObject({kind:z.literal('attachment'),attachment_id:z.string().min(1).max(256)}),
]);
const selection = z.discriminatedUnion('mode', [
  z.strictObject({mode:z.literal('all')}),
  z.strictObject({mode:z.literal('range'),start:z.int().positive(),end:z.int().positive()}),
  z.strictObject({mode:z.literal('sheets'),sheetNames:z.array(z.string()).min(1)}),
]);
const json = z.strictObject({pointer:z.string(),style:z.enum(['items','records','mermaid']),
  diagramDirection:z.enum(['TD','LR']).optional(),
  arraySelection:z.strictObject({all:z.boolean(),exceptions:z.array(z.int().nonnegative())}).optional()});

let current, result, busy, idle;
const ttl = 300000;
function envelope(value,isError=false) {
  return {isError,structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}]};
}
async function release() {
  clearTimeout(idle);
  const previous = current;
  current = undefined;
  result = undefined;
  await previous?.engine.close();
}
function register(name,description,schema,stage,run) {
  mcp.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:true}},async (args,extra) => {
    if (busy) return envelope({error:{stage,code:'BUSY'}},true);
    clearTimeout(idle);
    const controller = new AbortController();
    busy = controller;
    const signal = AbortSignal.any([extra.signal,controller.signal,AbortSignal.timeout(120000)]);
    const interrupt = () => { void current?.engine.close(); };
    signal.addEventListener('abort',interrupt,{once:true});
    try {
      signal.throwIfAborted();
      const value = await run(args,signal);
      signal.throwIfAborted();
      return envelope(value);
    } catch (error) {
      const code = signal.aborted ? (signal.reason?.name === 'TimeoutError' ? 'TIMEOUT' : 'CANCELLED') : error.code;
      const allowed = ['INVALID_ARGUMENT','FILE_NOT_FOUND','ACCESS_DENIED','BUSY','EXPIRED','RESOURCE_LIMIT',
        'CONVERSION_FAILED','CANCELLED','TIMEOUT','ATTACHMENT_UNAVAILABLE','WORKSPACE_UNAVAILABLE'];
      if (signal.aborted || stage === 'inspect' || !allowed.includes(code)) await release();
      return envelope({error:{stage,code:allowed.includes(code)?code:'CONVERSION_FAILED',reason:error.reason},
        ...(error.quality && {quality:error.quality})},true);
    } finally {
      signal.removeEventListener('abort',interrupt);
      busy = undefined;
      if (current) idle = setTimeout(() => { void release(); },ttl).unref();
    }
  });
}
register('inspect_document','Inspect one document in the current host workspace or a host-bound attachment. Returns a short-lived document_id.',
  z.strictObject({source}), 'inspect', async ({source},signal) => {
    await release();
    const input = source.kind === 'attachment' ? await attachmentInput(source.attachment_id,signal)
      : await projectInput(source.path,mcp.server,signal);
    signal.throwIfAborted();
    const engine = new BrowserEngine();
    current = {id:randomUUID(),engine};
    const inspection = await engine.inspect(input,signal);
    return {document_id:current.id,file_name:input.name,input_bytes:input.bytes.length,inspection};
  });

function chunk(offset) {
  let end = Math.min(offset + 16384,result.bytes.length);
  while (end < result.bytes.length && (result.bytes[end] & 0xc0) === 0x80) end--;
  let next = null;
  if (end < result.bytes.length) {
    next = result.byOffset.get(end);
    if (!next) {
      next = randomUUID();
      result.byOffset.set(end,next);
      result.cursors.set(next,end);
    }
  }
  return {document_id:current.id,markdown:result.bytes.toString('utf8',offset,end),offset_bytes:offset,
    total_bytes:result.bytes.length,sha256:result.hash,next_cursor:next,quality:result.quality};
}
register('convert_document','Convert the inspected document to Markdown. Check quality, reassemble chunks and verify length and SHA-256 before export.',
  z.strictObject({document_id:z.string(),selection:selection.optional(),insert_page_breaks:z.boolean().optional(),json:json.optional()}),
  'convert', async ({document_id,...options}) => {
    if (!current || document_id !== current.id) throw failure('EXPIRED');
    result = undefined;
    const {markdown,quality} = await current.engine.convert(options);
    const bytes = Buffer.from(markdown);
    if (bytes.length > 10*1024*1024) throw failure('RESOURCE_LIMIT');
    result = {bytes,quality,hash:createHash('sha256').update(bytes).digest('hex'),cursors:new Map(),byOffset:new Map()};
    return chunk(0);
  });
register('read_result','Read the next UTF-8 Markdown chunk of this conversion. Replaying a valid cursor returns the same chunk.',
  z.strictObject({cursor:z.string()}),'read',async ({cursor}) => {
    if (!result?.cursors.has(cursor)) throw failure('EXPIRED');
    return chunk(result.cursors.get(cursor));
  });
mcp.server.setNotificationHandler(RootsListChangedNotificationSchema,async () => {
  busy?.abort();
  await release();
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  busy?.abort();
  await release();
  await mcp.close();
}
process.stdin.once('end',() => void shutdown());
process.once('SIGTERM',() => void shutdown());
await mcp.connect(new StdioServerTransport());
