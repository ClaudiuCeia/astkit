export function buildSgrepResult(input) {
    return {
        scope: input.phase.scope,
        pattern: input.search.pattern,
        filesScanned: input.phase.filesScanned,
        filesMatched: input.phase.filesMatched,
        totalMatches: input.phase.totalMatches,
        elapsedMs: input.elapsedMs,
        files: input.phase.files,
    };
}
