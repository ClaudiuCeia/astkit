import type { SgrepFileResult, SgrepOptions } from "../types.ts";
import type { ParsedSearchSpec } from "./parse.ts";
export type SearchPhaseResult = {
    cwd: string;
    scope: string;
    filesScanned: number;
    filesMatched: number;
    totalMatches: number;
    files: SgrepFileResult[];
};
export declare function searchProjectFiles(search: ParsedSearchSpec, options: SgrepOptions): Promise<SearchPhaseResult>;
