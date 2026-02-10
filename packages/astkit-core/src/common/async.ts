export type MapLimitOptions = {
  concurrency: number;
};

// Minimal dependency-free concurrency limiter.
// Preserves input order in the returned array.
export async function mapLimit<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: MapLimitOptions,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  if (items.length === 0) {
    return [];
  }

  if (concurrency === 1 || items.length === 1) {
    const out: R[] = new Array(items.length);
    for (let i = 0; i < items.length; i += 1) {
      out[i] = await mapper(items[i] as T, i);
    }
    return out;
  }

  const out: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown | null = null;

  async function worker(): Promise<void> {
    while (true) {
      if (firstError) {
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      try {
        out[index] = await mapper(items[index] as T, index);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  }

  const workers = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return out;
}

