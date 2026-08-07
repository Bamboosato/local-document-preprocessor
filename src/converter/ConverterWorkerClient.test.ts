import { describe, expect, it, vi } from 'vitest';
import { ConverterWorkerClient } from './ConverterWorkerClient';
import type { WorkerRequest, WorkerResponse } from './contracts';

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: OnErrorEventHandler = null;
  terminate = vi.fn();
  posted: WorkerRequest[] = [];

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  respond(response: WorkerResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: response }));
  }
}

const fakeFile = {
  name: 'people.csv',
  arrayBuffer: async () => new TextEncoder().encode('name\n山田太郎').buffer,
} as File;

describe('ConverterWorkerClient', () => {
  it('構造検査要求と変換範囲をWorkerへ渡す', async () => {
    const worker = new FakeWorker();
    const client = new ConverterWorkerClient(() => worker as unknown as Worker);
    const inspected = client.inspect(fakeFile);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    const inspectRequest = worker.posted[0];
    expect(inspectRequest).toMatchObject({ type: 'inspect', fileName: 'people.csv' });
    worker.respond({
      type: 'inspect-success',
      id: inspectRequest.id,
      inspection: { selectionKind: 'document', supportsSelection: false, sheets: [] },
    });
    await expect(inspected).resolves.toMatchObject({ selectionKind: 'document' });

    const converted = client.convert(fakeFile, { mode: 'range', start: 2, end: 3 });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(worker.posted[1]).toMatchObject({
      type: 'convert',
      selection: { mode: 'range', start: 2, end: 3 },
      options: { insertPageBreaks: true },
    });
    const convertRequest = worker.posted[1];
    worker.respond({
      type: 'error',
      id: convertRequest.id,
      error: { code: 'invalidSelection' },
    });
    await expect(converted).rejects.toMatchObject({ code: 'invalidSelection' });
    client.dispose();
  });

  it('terminates and immediately recreates the worker on cancel', async () => {
    const workers: FakeWorker[] = [];
    const client = new ConverterWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const pending = client.convert(fakeFile);
    await vi.waitFor(() => expect(workers[0].posted).toHaveLength(1));

    client.cancel();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    client.dispose();
  });

  it('ignores late responses from the terminated worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new ConverterWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const pending = client.convert(fakeFile);
    await vi.waitFor(() => expect(workers[0].posted).toHaveLength(1));
    const request = workers[0].posted[0];
    client.cancel();
    workers[0].respond({
      type: 'error',
      id: request.id,
      error: { code: 'unknown' },
    });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(2);
    client.dispose();
  });
});
