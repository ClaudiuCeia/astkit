import type { SgrepResult } from "../types.ts";
import type { ParsedSearchSpec } from "./parse.ts";
import type { SearchPhaseResult } from "./search.ts";
export type OutputPhaseInput = {
    search: ParsedSearchSpec;
    phase: SearchPhaseResult;
    elapsedMs: number;
};
export declare function buildSgrepResult(input: OutputPhaseInput): SgrepResult;
