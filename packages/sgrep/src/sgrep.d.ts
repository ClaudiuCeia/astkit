import type { SgrepOptions, SgrepResult } from "./types.ts";
export declare function searchProject(patternInput: string, options?: SgrepOptions): Promise<SgrepResult>;
export declare const sgrep: typeof searchProject;
