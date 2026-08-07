/// <reference lib="webworker" />

import { convertWithPageBreaks } from '../conversion/convertWithPageBreaks';
import { finalizeConversion } from '../conversion/finalizeConversion';
import { AnyDocConverter } from './AnyDocConverter';
import type { WorkerRequest, WorkerResponse } from './contracts';
import { serializeConversionError } from './errors';
import { PdfiumTextExtractor } from './PdfiumTextExtractor';
import { inspectDocument, prepareSelectedDocument } from '../selection/documentSelection';
import { PdfPageProcessor } from '../selection/PdfPageProcessor';

const converter = new AnyDocConverter();
const pdfTextExtractor = new PdfiumTextExtractor();
const pdfPageProcessor = new PdfPageProcessor(pdfTextExtractor);
const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const bytes = new Uint8Array(request.buffer);

  try {
    if (request.type === 'inspect') {
      const inspection = await inspectDocument(request.fileName, bytes, pdfPageProcessor);
      const response: WorkerResponse = {
        type: 'inspect-success',
        id: request.id,
        inspection,
      };
      workerScope.postMessage(response);
      return;
    }

    const selectedBytes = await prepareSelectedDocument(
      request.fileName,
      bytes,
      request.selection,
      pdfPageProcessor,
    );
    const converted = await convertWithPageBreaks(
      converter,
      {
        fileName: request.fileName,
        bytes: selectedBytes,
      },
      request.options.insertPageBreaks,
      pdfPageProcessor,
    );
    let result;
    try {
      result = await finalizeConversion({
        bytes: selectedBytes,
        fileName: request.fileName,
        converted,
        pdfTextExtractor,
        insertPageBreaks: request.options.insertPageBreaks,
      });
    } catch {
      const error = new Error('Post-processing failed.') as Error & {
        code: 'postprocessingFailed';
      };
      error.code = 'postprocessingFailed';
      throw error;
    }
    const response: WorkerResponse = {
      type: 'convert-success',
      id: request.id,
      result,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      id: request.id,
      error: serializeConversionError(error),
    };
    workerScope.postMessage(response);
  }
};

export {};
