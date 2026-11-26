import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {win32} from 'node:path';
import {realpath} from 'node:fs/promises';
import {connect} from 'node:net';
import {createHash} from 'node:crypto';

export const MAX_INPUT = 50 * 1024 * 1024;
export function failure(code, reason, quality) {
  return Object.assign(new Error(code), {code, reason, quality});
}
function validatePath(path) {
  const pieces = path.split(/[\\/]/);
  if (pieces.some(part => !part || part === '.' || part === '..' ||
      /[<>:"|?*\u0000-\u001f]|[ .]$/u.test(part) ||
      /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw failure('ACCESS_DENIED');
  }
}
export async function projectInput(path, server, signal) {
  path = path.replace(/^(?:\.[\\/])+/, '');
  validatePath(path);
  if (!server.getClientCapabilities()?.roots) throw failure('WORKSPACE_UNAVAILABLE');
  const {roots} = await server.listRoots({}, {signal, timeout:10000});
  if (roots.length !== 1 || process.platform !== 'win32') throw failure('WORKSPACE_UNAVAILABLE');
  const url = new URL(roots[0].uri);
  if (url.protocol !== 'file:' || url.host) throw failure('ACCESS_DENIED');
  const root = await realpath(fileURLToPath(url));
  if (!/^[a-z]:\\/i.test(root)) throw failure('ACCESS_DENIED');
  try {
    const {stdout} = await promisify(execFile)(win32.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
      '-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',fileURLToPath(new URL('./read-project.ps1', import.meta.url)),
    ], {env:{...process.env,LDP_READ_ROOT:root,LDP_READ_RELATIVE:path}, encoding:'buffer',
      maxBuffer:MAX_INPUT, windowsHide:true, signal});
    return {name:win32.basename(path), bytes:stdout};
  } catch (error) {
    if (error.code === 2) throw failure('FILE_NOT_FOUND');
    if (error.code === 4 || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw failure('RESOURCE_LIMIT');
    throw failure('ACCESS_DENIED');
  }
}

// The host binds a private, single-request pipe to one selected attachment.
// No filesystem path, arbitrary URL or file data is accepted as a tool argument.
export async function attachmentInput(id, signal) {
  const {LDP_ATTACHMENT_ID: expected, LDP_ATTACHMENT_TOKEN: token,
    LDP_ATTACHMENT_NAME: name, LDP_ATTACHMENT_SIZE: sizeText} = process.env;
  if (!expected) throw failure('ATTACHMENT_UNAVAILABLE');
  if (id !== expected) throw failure('ACCESS_DENIED');
  if (!name || !token || !/^[0-9a-f]{64}$/.test(token)) throw failure('ATTACHMENT_UNAVAILABLE');
  validatePath(name);
  if (win32.basename(name) !== name) throw failure('INVALID_ARGUMENT');
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_INPUT) throw failure('RESOURCE_LIMIT');
  const address = process.env.LDP_ATTACHMENT_PIPE;
  if (!/^[0-9a-f-]{36}$/.test(address ?? '')) throw failure('ATTACHMENT_UNAVAILABLE');
  const socket = connect({path:pipeName(address),signal},() => socket.write(token));
  const abort = () => socket.destroy(new Error('cancelled'));
  signal.addEventListener('abort', abort, {once:true});
  try {
    const chunks = [];
    let received = 0;
    for await (const chunk of socket) {
      received += chunk.length;
      if (received > size) throw failure('RESOURCE_LIMIT');
      chunks.push(chunk);
    }
    if (received !== size) throw failure('ATTACHMENT_UNAVAILABLE');
    const bytes = Buffer.concat(chunks, size);
    if (createHash('sha256').update(bytes).digest('hex') !== process.env.LDP_ATTACHMENT_SHA) throw failure('ATTACHMENT_UNAVAILABLE');
    return {name, bytes};
  } catch (error) {
    if (error.code === 'RESOURCE_LIMIT') throw error;
    throw failure('ATTACHMENT_UNAVAILABLE');
  } finally {
    signal.removeEventListener('abort', abort);
    socket.destroy();
  }
}
export function pipeName(token) {
  return '\\\\.\\pipe\\ldp-input-' + token;
}
