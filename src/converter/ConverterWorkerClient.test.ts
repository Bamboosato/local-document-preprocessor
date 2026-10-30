import { describe, expect, it, vi } from 'vitest';
import { ConverterWorkerClient as ProductionClient } from './ConverterWorkerClient';
import type { WorkerRequest, WorkerResponse } from './contracts';
class ConverterWorkerClient extends ProductionClient {
  constructor(factory:()=>Worker){super(factory,file=>file.arrayBuffer());}
}

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
  it('SR-30 stale Worker errors do not cancel the new document request or recreate a disposed client',async()=>{
    const workers:FakeWorker[]=[],client=new ConverterWorkerClient(()=>{const worker=new FakeWorker();workers.push(worker);return worker as unknown as Worker;});
    const failed=client.inspect(fakeFile).catch(error=>error.code);await vi.waitFor(()=>expect(workers[0].posted).toHaveLength(1));workers[0].onerror?.call(window,new Event('error'));expect(await failed).toBe('unknown');expect(workers).toHaveLength(1);
    workers[0].onerror?.call(window,new Event('error'));expect(workers).toHaveLength(1);
    const next=client.inspect(fakeFile);await vi.waitFor(()=>expect(workers[1].posted).toHaveLength(1));workers[0].onerror?.call(window,new Event('error'));
    workers[1].respond({type:'inspect-success',id:workers[1].posted[0].id,inspection:{selectionKind:'document',supportsSelection:false,sheets:[]}});await next;expect(workers).toHaveLength(2);
    client.dispose();workers[1].onerror?.call(window,new Event('error'));expect(workers).toHaveLength(2);
  });
  it('SR-21 cancellation during native I/O never posts the obsolete document to the replacement Worker',async()=>{
    const workers:FakeWorker[]=[],client=new ProductionClient(()=>{const worker=new FakeWorker();workers.push(worker);return worker as unknown as Worker;});
    const pending=client.inspect(new File(['a,b\n1,2'],'synthetic.csv')).catch(error=>error.name);client.cancel();
    expect(await pending).toBe('AbortError');expect(workers.every(worker=>worker.posted.length===0)).toBe(true);client.dispose();
  });
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
