export function nowNs(): bigint {
  // Prefer runtime-agnostic high-resolution clock.
  const hr = (globalThis as unknown as { process?: { hrtime?: { bigint?: () => bigint } } }).process
    ?.hrtime?.bigint;
  if (typeof hr === "function") {
    return hr();
  }

  // Bun provides nanosecond resolution as well.
  const bunNs = (globalThis as unknown as { Bun?: { nanoseconds?: () => bigint } }).Bun
    ?.nanoseconds;
  if (typeof bunNs === "function") {
    return bunNs();
  }

  return BigInt(Date.now()) * 1_000_000n;
}

export function nsToMs(ns: bigint): number {
  return Number(ns) / 1e6;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    return `${ms}ms`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms >= 10) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${ms.toFixed(2)}ms`;
}
