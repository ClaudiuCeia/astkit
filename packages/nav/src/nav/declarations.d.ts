import { type ChalkInstance } from "chalk";
interface MemberInfo {
    name: string;
    signature: string;
    line: number;
    doc?: string;
}
interface DeclarationInfo {
    name: string;
    kind: string;
    signature: string;
    line: number;
    members?: MemberInfo[];
    doc?: string;
    endLine?: number;
    declarationText?: string;
}
interface DeclarationsOutput {
    file: string;
    declarations: DeclarationInfo[];
    doc?: string;
}
type FormatDeclarationsOutputOptions = {
    color?: boolean;
    chalkInstance?: ChalkInstance;
};
export declare function formatDeclarationsOutput(result: DeclarationsOutput, options?: FormatDeclarationsOutputOptions): string;
export declare function getDeclarations(filePath: string): DeclarationsOutput;
export type DeclarationsCommandFlags = {
    json?: boolean;
    "no-color"?: boolean;
};
export declare const declarationsCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
export {};
