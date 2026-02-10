import type { SpatchResult } from "../types.ts";
import type { ParsedPatchSpec } from "./parse.ts";
import type { RewritePhaseResult } from "./rewrite.ts";
export type OutputPhaseInput = {
    patch: ParsedPatchSpec;
    rewrite: RewritePhaseResult;
    elapsedMs: number;
};
export declare function buildSpatchResult(input: OutputPhaseInput): SpatchResult;
