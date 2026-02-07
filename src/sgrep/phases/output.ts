import type { SgrepResult } from "../types.ts";
import type { ParsedSearchSpec } from "./parse.ts";
import type { SearchPhaseResult } from "./search.ts";

export type OutputPhaseInput = {
  search: ParsedSearchSpec;
  phase: SearchPhaseResult;
  elapsedMs: number;
};

export function buildSgrepResult(input: OutputPhaseInput): SgrepResult {
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
