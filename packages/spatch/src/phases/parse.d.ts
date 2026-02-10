import type { SpatchOptions } from "../types.ts";
export type ParsedPatchSpec = {
    pattern: string;
    replacement: string;
};
export type ParsedPatchInvocation = {
    patch: ParsedPatchSpec;
    options: SpatchOptions;
};
export declare function parsePatchSpec(patchDocument: string): ParsedPatchSpec;
export declare function parsePatchInvocation(patchInput: string, options?: SpatchOptions): Promise<ParsedPatchInvocation>;
