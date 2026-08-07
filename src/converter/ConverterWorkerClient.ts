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

  constructor(
    private readonly workerFactory: WorkerFactory = () =>
      new Worker(new URL('./converter.worker.ts', import.meta.url), {
        type: 'module',
        name: 'local-document-converter',
      }),
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

    const buffer = await file.arrayBuffer();
    if (signal?.aborted) {
      throw abortError();
    }

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
    this.worker.terminate();
    this.rejectAll(abortError());
    this.worker = this.createWorker();
  }

  dispose(): void {
    this.worker.terminate();
    this.rejectAll(abortError());
  }

  private createWorker(): Worker {
    const worker = this.workerFactory();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
      this.rejectAll(new WorkerConversionError('unknown'));
      worker.terminate();
      if (this.worker === worker) {
        this.worker = this.createWorker();
      }
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
