export function buildSpatchResult(input) {
    return {
        dryRun: input.rewrite.dryRun,
        scope: input.rewrite.scope,
        pattern: input.patch.pattern,
        replacement: input.patch.replacement,
        filesScanned: input.rewrite.filesScanned,
        filesMatched: input.rewrite.filesMatched,
        filesChanged: input.rewrite.filesChanged,
        totalMatches: input.rewrite.totalMatches,
        totalReplacements: input.rewrite.totalReplacements,
        elapsedMs: input.elapsedMs,
        files: input.rewrite.files,
    };
}
