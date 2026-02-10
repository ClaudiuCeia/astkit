import { type ChalkInstance } from "chalk";
import type { SpatchOccurrence, SpatchResult } from "./types.ts";
export type PatchCommandFlags = {
    "dry-run"?: boolean;
    interactive?: boolean;
    json?: boolean;
    "no-color"?: boolean;
    cwd?: string;
    concurrency?: number;
    verbose?: number;
};
type InteractiveChoice = "yes" | "no" | "all" | "quit";
export type InteractiveContext = {
    file: string;
    occurrence: SpatchOccurrence;
    changeNumber: number;
    totalChanges: number;
};
export type RunPatchCommandOptions = {
    interactiveDecider?: (ctx: InteractiveContext) => Promise<InteractiveChoice>;
};
export declare function runPatchCommand(patchInput: string, scope: string | undefined, flags: PatchCommandFlags, options?: RunPatchCommandOptions): Promise<SpatchResult>;
type FormatPatchOutputOptions = {
    color?: boolean;
    chalkInstance?: ChalkInstance;
};
export declare function formatPatchOutput(result: SpatchResult, options?: FormatPatchOutputOptions): string;
export declare const patchCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
export {};
