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
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new RangeError("concurrency must be a positive finite number");
  }
  const concurrency = Math.floor(options.concurrency);
  if (items.length === 0) {
    return [];
  }

  if (concurrency === 1 || items.length === 1) {
    const out: R[] = [];
    out.length = items.length;
    for (let i = 0; i < items.length; i += 1) {
      out[i] = await mapper(items[i] as T, i);
    }
    return out;
  }

  const out: R[] = [];
  out.length = items.length;
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (true) {
      if (failed) {
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
        failed = true;
        firstError = error;
        return;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  if (failed) {
    throw firstError;
  }

  return out;
}
