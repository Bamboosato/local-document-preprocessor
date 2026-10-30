import type {
  ConversionOptions,
  ConversionResult,
  DocumentInspection,
  DocumentSelection,
  SerializedConversionError,
  WorkerRequest,
  WorkerResponse,
} from './contracts';
import { DEFAULT_CONVERSION_OPTIONS as defaultConversionOptions } from './contracts';
import {readFileBytes} from './readFileBytes';

type WorkerFactory = () => Worker;

interface PendingRequest {
  operation: 'convert' | 'inspect';
  resolve: (result: ConversionResult | DocumentInspection) => void;
  reject: (reason?: unknown) => void;
  cleanup: () => void;
}

export class WorkerConversionError extends Error {
  constructor(public readonly code: SerializedConversionError['code']) {
    super(code);
    this.name = 'WorkerConversionError';
  }
}

function abortError(): DOMException {
  return new DOMException('Conversion was cancelled.', 'AbortError');
}

export class ConverterWorkerClient {
  private worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly reads=new Set<AbortController>();
  private disposed=false;
  private needsWorker=false;

  constructor(
    private readonly workerFactory: WorkerFactory = () =>
      new Worker(new URL('./converter.worker.ts', import.meta.url), {
        type: 'module',
        name: 'local-document-converter',
      }),
    private readonly readBytes=(file:File,signal:AbortSignal)=>readFileBytes(file,signal,code=>new WorkerConversionError(code)),
  ) {
    this.worker = this.createWorker();
  }

  convert(
    file: File,
    selection: DocumentSelection = { mode: 'all' },
    options: ConversionOptions = defaultConversionOptions,
    signal?: AbortSignal,
  ): Promise<ConversionResult> {
    return this.request<ConversionResult>(
      file,
      'convert',
      (id, buffer) => ({
        type: 'convert',
        id,
        fileName: file.name,
        buffer,
        selection,
        options,
      }),
      signal,
    );
  }

  inspect(file: File, signal?: AbortSignal): Promise<DocumentInspection> {
    return this.request<DocumentInspection>(
      file,
      'inspect',
      (id, buffer) => ({ type: 'inspect', id, fileName: file.name, buffer }),
      signal,
    );
  }

  private async request<TResult extends ConversionResult | DocumentInspection>(
    file: File,
    operation: PendingRequest['operation'],
    createRequest: (id: string, buffer: ArrayBuffer) => WorkerRequest,
    signal?: AbortSignal,
  ): Promise<TResult> {
    if (signal?.aborted) {
      throw abortError();
    }
    if(this.disposed)throw abortError();

    const controller=new AbortController(),abortRead=()=>controller.abort();
    this.reads.add(controller);signal?.addEventListener('abort',abortRead,{once:true});
    let buffer:ArrayBuffer;
    try{buffer=await this.readBytes(file,controller.signal);if(controller.signal.aborted)throw abortError();}
    finally{this.reads.delete(controller);signal?.removeEventListener('abort',abortRead);}
    if (signal?.aborted) {
      throw abortError();
    }

    if(this.needsWorker){this.worker=this.createWorker();this.needsWorker=false;}
    const id = crypto.randomUUID();

    return new Promise<TResult>((resolve, reject) => {
      const onAbort = () => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        this.pending.delete(id);
        pending.cleanup();
        reject(abortError());
      };
      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      this.pending.set(id, {
        operation,
        resolve: resolve as PendingRequest['resolve'],
        reject,
        cleanup,
      });
      signal?.addEventListener('abort', onAbort, { once: true });

      const request = createRequest(id, buffer);
      this.worker.postMessage(request, [buffer]);
    });
  }

  cancel(): void {
    if(this.disposed)return;
    for(const read of this.reads)read.abort();
    this.worker.terminate();
    this.rejectAll(abortError());
    this.needsWorker=false;
    this.worker = this.createWorker();
  }

  dispose(): void {
    this.disposed=true;
    for(const read of this.reads)read.abort();
    this.worker.terminate();
    this.rejectAll(abortError());
  }

  private createWorker(): Worker {
    const worker = this.workerFactory();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if(this.disposed||this.worker!==worker)return;
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      this.pending.delete(response.id);
      pending.cleanup();
      if (response.type === 'convert-success' && pending.operation === 'convert') {
        pending.resolve(response.result);
      } else if (response.type === 'inspect-success' && pending.operation === 'inspect') {
        pending.resolve(response.inspection);
      } else if (response.type !== 'error') {
        pending.reject(new WorkerConversionError('unknown'));
      } else {
        pending.reject(new WorkerConversionError(response.error.code));
      }
    };
    worker.onerror = () => {
      if(this.disposed||this.worker!==worker||this.needsWorker)return;
      this.rejectAll(new WorkerConversionError('unknown'));
      worker.terminate();
      // A missing/offline worker asset must not start an eager retry loop.
      // Recreate only when a later explicit request needs it.
      this.needsWorker=true;
    };
    return worker;
  }

  private rejectAll(reason: unknown): void {
    this.pending.forEach((pending) => {
      pending.cleanup();
      pending.reject(reason);
    });
    this.pending.clear();
  }
}
