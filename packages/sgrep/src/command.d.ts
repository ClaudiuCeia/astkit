import { type ChalkInstance } from "chalk";
import type { SgrepResult } from "./types.ts";
export type SearchCommandFlags = {
    cwd?: string;
    "no-isomorphisms"?: boolean;
    "no-color"?: boolean;
    json?: boolean;
    concurrency?: number;
    verbose?: number;
};
export declare function runSearchCommand(patternInput: string, scope: string | undefined, flags: SearchCommandFlags): Promise<SgrepResult>;
type FormatSearchOutputOptions = {
    color?: boolean;
    chalkInstance?: ChalkInstance;
};
export declare function formatSearchOutput(result: SgrepResult, options?: FormatSearchOutputOptions): string;
export declare const searchCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
export {};
