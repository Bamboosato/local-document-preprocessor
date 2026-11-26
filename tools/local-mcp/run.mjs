// Host-side adapter. Standard input contains a JSON request for exactly one
// document. The invoking agent supplies its working directory or attachment.
import {open} from 'node:fs/promises';
import {basename} from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {MAX_INPUT,failure} from './source.mjs';
import {convert,withLdp,noteInput} from './host.mjs';
import {withMkb} from './save.mjs';

const requestSchema=z.strictObject({
  source:z.discriminatedUnion('kind',[
    z.strictObject({kind:z.literal('project_file'),path:z.string().min(1)}),
    z.strictObject({kind:z.literal('attachment'),host_file:z.string().min(1),file_name:z.string().min(1).optional()}),
  ]),
  options:z.object({}).passthrough().optional(),
  title:z.string().optional(),tags:z.array(z.string()).optional(),
  request_id:z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional(),
});
async function readRequest() {
  const parts=[];
  let length=0;
  for await (const chunk of process.stdin) {
    length+=chunk.length;
    if (length>262144) throw failure('INVALID_ARGUMENT');
    parts.push(chunk);
  }
  const parsed=requestSchema.safeParse(JSON.parse(Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/,'')));
  if (!parsed.success) throw failure('INVALID_ARGUMENT');
  return parsed.data;
}

async function readAttachment(source) {
  const fh=await open(source.host_file,'r').catch(()=>{throw failure('ATTACHMENT_UNAVAILABLE');});
  try {
    const stat=await fh.stat();
    if (!stat.isFile()) throw failure('ATTACHMENT_UNAVAILABLE');
    if (stat.size>MAX_INPUT) throw failure('RESOURCE_LIMIT');
    const parts=[];
    let count=0;
    for await (const chunk of fh.createReadStream({autoClose:false})) {
      count+=chunk.length;
      if (count>MAX_INPUT) throw failure('RESOURCE_LIMIT');
      parts.push(chunk);
    }
    if (count!==stat.size) throw failure('ATTACHMENT_UNAVAILABLE');
    return {id:randomUUID(),name:source.file_name ?? basename(source.host_file),bytes:Buffer.concat(parts,count)};
  } finally {await fh.close();}
}
async function processDocument(req,signal) {
  const attachment=req.source.kind==='attachment' ? await readAttachment(req.source) : undefined;
  const source=attachment?{kind:'attachment',attachment_id:attachment.id}:req.source;
  const workspace=attachment?undefined:process.cwd();
  return withLdp({workspace,attachment,signal},call=>convert(call,source,req.options));
}
const controller=new AbortController();
for (const event of ['SIGINT','SIGTERM']) process.once(event,()=>controller.abort());
try {
  const {values}=parseArgs({options:{'mkb-server':{type:'string'},'mkb-origin':{type:'string'},'prepare-note':{type:'boolean'}}});
  const req=await readRequest();
  if (Boolean(values['mkb-server'])!==Boolean(values['mkb-origin']) || values['prepare-note'] && values['mkb-server']) throw failure('INVALID_ARGUMENT');
  let output;
  if (values['mkb-server']) {
    output=await withMkb(values['mkb-server'],values['mkb-origin'],controller.signal,async save=>{
      const converted=await processDocument(req,controller.signal);
      const note=noteInput(converted,req.options,req);
      return {...await save(note),sha256:converted.sha256,quality:converted.quality};
    });
  } else {
    const converted=await processDocument(req,controller.signal);
    const content=values['prepare-note'] ? {note:noteInput(converted,req.options,req)} : {markdown:converted.markdown};
    output={...content,quality:converted.quality,sha256:converted.sha256};
  }
  process.stdout.write(JSON.stringify(output)+'\n');
} catch (error) {
  const code=/^[A-Z_]+$/.test(error.code??'')?error.code:'INVALID_ARGUMENT';
  process.stderr.write(JSON.stringify({error:{code,reason:error.reason,quality:error.quality,request_id:error.requestId}})+'\n');
  process.exitCode=1;
}
