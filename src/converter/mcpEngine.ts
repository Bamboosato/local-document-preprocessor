import {JsonWorkerClient} from '../json/JsonWorkerClient';
import {isJsonFile, type JsonSettings} from '../json/contracts';
import {ConverterWorkerClient, WorkerConversionError} from './ConverterWorkerClient';
import {defaultOptions} from './defaultOptions';
import {SUPPORTED_EXTENSIONS, type DocumentInspection, type DocumentSelection} from './contracts';

// This module is only an entry point of the local build. It never mounts the UI or SW.
let file: File;
let inspection: DocumentInspection;
let json: JsonWorkerClient | undefined;
let documentClient: ConverterWorkerClient | undefined;
const parts: ArrayBuffer[] = [];

const engine = {
  append(base64: string) {
    parts.push(Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer);
  },
  async inspect(name: string) {
    file = new File(parts, name);
    parts.length = 0;
    if (!SUPPORTED_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext))) return {error:'unsupported'};
    try {
      if (isJsonFile(name)) {
        json = new JsonWorkerClient();
        inspection = await json.inspect(file);
      } else {
        documentClient = new ConverterWorkerClient();
        inspection = await documentClient.inspect(file);
      }
      return {inspection};
    } catch (error) { return {error: error instanceof WorkerConversionError ? error.code : 'unknown'}; }
  },
  async convert(input: {selection?: DocumentSelection; insert_page_breaks?: boolean; json?: JsonSettings}) {
    const defaults = defaultOptions(inspection);
    try {
      if (input.json && !json || json && (input.selection || input.insert_page_breaks !== undefined) ||
          input.insert_page_breaks === true && !defaults.insertPageBreaks) return {error:'invalidSelection'};
      const result = json
        ? await json.convert(file, input.json ?? defaults.json!)
        : await documentClient!.convert(file, input.selection ?? {mode:'all'}, {
          insertPageBreaks: input.insert_page_breaks ?? defaults.insertPageBreaks,
        });
      return {quality: result.quality, markdown: result.quality.safeToExport ? result.markdown : undefined};
    } catch (error) { return {error: error instanceof WorkerConversionError ? error.code : 'unknown'}; }
  },
};
Object.assign(window, {ldpEngine: engine});
