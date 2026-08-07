interface QueueHooks<TItem, TResult> {
  onStart: (item: TItem, index: number) => void;
  onSuccess: (item: TItem, result: TResult, index: number) => void;
  onError: (item: TItem, error: unknown, index: number) => void;
}

export async function processSequentially<TItem, TResult>(
  items: readonly TItem[],
  task: (item: TItem, signal: AbortSignal) => Promise<TResult>,
  hooks: QueueHooks<TItem, TResult>,
  signal: AbortSignal,
): Promise<void> {
  for (let index = 0; index < items.length; index += 1) {
    if (signal.aborted) {
      return;
    }

    const item = items[index];
    hooks.onStart(item, index);

    try {
      const result = await task(item, signal);
      if (signal.aborted) {
        return;
      }
      hooks.onSuccess(item, result, index);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      hooks.onError(item, error, index);
    }
  }
}
