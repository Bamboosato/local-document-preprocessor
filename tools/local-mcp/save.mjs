import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {dirname,isAbsolute} from 'node:path';
import {failure} from './source.mjs';

// The existing MKB server owns pairing and the database. Never print its raw
// status, because disconnected status may contain a pairing credential.
export async function withMkb(entry,origin,signal,action) {
  if (!isAbsolute(entry)) throw failure('INVALID_ARGUMENT');
  const client=new Client({name:'ldp-local-handoff',version:'0.1.0'});
  async function ready() {
    const response=await client.callTool({name:'connection_status',arguments:{}},undefined,{signal});
    const status=JSON.parse(response.content[0].text);
    if (response.isError || !status.connected || status.browserOrigin!==origin ||
        !status.capabilities?.includes('create_note')) throw failure('MKB_NOT_READY');
  }
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],cwd:dirname(entry),stderr:'pipe'}));
    await ready();
    return await action(async note=>{
      await ready();
      signal.throwIfAborted();
      const expected='mcp-'+createHash('sha256').update(note.request_id).digest('hex');
      try {
        const response=await client.callTool({name:'create_note',arguments:note},undefined,{signal});
        const receipt=JSON.parse(response.content[0].text);
        if (response.isError || receipt.status!=='saved' || receipt.id!==expected || receipt.title!==note.title) throw failure('MKB_OUTCOME_UNKNOWN');
        return {status:receipt.status,id:receipt.id,title:receipt.title,reused:receipt.reused,request_id:note.request_id};
      } catch {
        throw Object.assign(failure('MKB_OUTCOME_UNKNOWN'),{requestId:note.request_id});
      }
    });
  } finally {await client.close();}
}
