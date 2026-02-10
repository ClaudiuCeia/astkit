import type { SpatchFileResult, SpatchOptions } from "../types.ts";
import type { ParsedPatchSpec } from "./parse.ts";
export type RewritePhaseResult = {
    cwd: string;
    scope: string;
    dryRun: boolean;
    filesScanned: number;
    filesMatched: number;
    filesChanged: number;
    totalMatches: number;
    totalReplacements: number;
    files: SpatchFileResult[];
};
export declare function rewriteProject(patch: ParsedPatchSpec, options: SpatchOptions): Promise<RewritePhaseResult>;
