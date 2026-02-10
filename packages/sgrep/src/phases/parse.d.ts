import type { SgrepOptions } from "../types.ts";
export type ParsedSearchSpec = {
    pattern: string;
};
export type ParsedSearchInvocation = {
    search: ParsedSearchSpec;
    options: SgrepOptions;
};
export declare function parseSearchSpec(pattern: string): ParsedSearchSpec;
export declare function parseSearchInvocation(patternInput: string, options?: SgrepOptions): Promise<ParsedSearchInvocation>;
