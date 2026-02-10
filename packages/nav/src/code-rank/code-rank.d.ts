import { type CodeRankResult } from "./rank.ts";
export type CodeRankCommandFlags = {
    cwd?: string;
    limit?: number;
    json?: boolean;
};
export declare function runCodeRankCommand(scope: string | undefined, flags: CodeRankCommandFlags): Promise<CodeRankResult>;
export declare function formatCodeRankOutput(result: CodeRankResult): string;
export declare const codeRankCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
