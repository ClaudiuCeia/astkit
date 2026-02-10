export function nowNs() {
    // Prefer runtime-agnostic high-resolution clock.
    const hr = globalThis
        .process?.hrtime?.bigint;
    if (typeof hr === "function") {
        return hr();
    }
    // Bun provides nanosecond resolution as well.
    const bunNs = globalThis.Bun
        ?.nanoseconds;
    if (typeof bunNs === "function") {
        return bunNs();
    }
    return BigInt(Date.now()) * 1000000n;
}
export function nsToMs(ns) {
    return Number(ns) / 1e6;
}
export function formatMs(ms) {
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
