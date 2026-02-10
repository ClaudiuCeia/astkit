// Minimal dependency-free concurrency limiter.
// Preserves input order in the returned array.
export async function mapLimit(items, mapper, options) {
    const concurrency = Math.max(1, Math.floor(options.concurrency));
    if (items.length === 0) {
        return [];
    }
    if (concurrency === 1 || items.length === 1) {
        const out = new Array(items.length);
        for (let i = 0; i < items.length; i += 1) {
            out[i] = await mapper(items[i], i);
        }
        return out;
    }
    const out = new Array(items.length);
    let nextIndex = 0;
    let firstError = null;
    async function worker() {
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
                out[index] = await mapper(items[index], index);
            }
            catch (error) {
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
