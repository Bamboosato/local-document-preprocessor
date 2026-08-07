import { describe, expect, it, vi } from 'vitest';
import { processSequentially } from './processQueue';

describe('processSequentially', () => {
  it('never executes more than one file concurrently and preserves order', async () => {
    let active = 0;
    let maxActive = 0;
    const events: string[] = [];
    const controller = new AbortController();

    await processSequentially(
      ['first', 'second', 'third'],
      async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        events.push(`task:${item}`);
        await Promise.resolve();
        active -= 1;
        return item.toUpperCase();
      },
      {
        onStart: (item) => events.push(`start:${item}`),
        onSuccess: (item, result) => events.push(`success:${item}:${result}`),
        onError: vi.fn(),
      },
      controller.signal,
    );

    expect(maxActive).toBe(1);
    expect(events).toEqual([
      'start:first',
      'task:first',
      'success:first:FIRST',
      'start:second',
      'task:second',
      'success:second:SECOND',
      'start:third',
      'task:third',
      'success:third:THIRD',
    ]);
  });

  it('continues with the next file after a classified failure', async () => {
    const successes: string[] = [];
    const failures: string[] = [];

    await processSequentially(
      ['good-1', 'bad', 'good-2'],
      async (item) => {
        if (item === 'bad') throw new Error('broken');
        return item;
      },
      {
        onStart: vi.fn(),
        onSuccess: (_item, result) => successes.push(result),
        onError: (item) => failures.push(item),
      },
      new AbortController().signal,
    );

    expect(successes).toEqual(['good-1', 'good-2']);
    expect(failures).toEqual(['bad']);
  });

  it('does not start the next item after cancellation', async () => {
    const controller = new AbortController();
    const started: string[] = [];

    await processSequentially(
      ['first', 'second'],
      async (item) => {
        controller.abort();
        return item;
      },
      {
        onStart: (item) => started.push(item),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      },
      controller.signal,
    );

    expect(started).toEqual(['first']);
  });
});
