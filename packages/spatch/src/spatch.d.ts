import type { SpatchOptions, SpatchResult } from "./types.ts";
export declare function patchProject(patchInput: string, options?: SpatchOptions): Promise<SpatchResult>;
export declare const spatch: typeof patchProject;
