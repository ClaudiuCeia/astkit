import type { SpatchResult } from "../types.ts";
import type { ParsedPatchSpec } from "./parse.ts";
import type { RewritePhaseResult } from "./rewrite.ts";

type OutputPhaseInput = {
  patch: ParsedPatchSpec;
  rewrite: RewritePhaseResult;
  elapsedMs: number;
};

export function buildSpatchResult(input: OutputPhaseInput): SpatchResult {
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
