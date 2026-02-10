import ts from "typescript";
export interface Service {
    service: ts.LanguageService;
    program: ts.Program;
    projectRoot: string;
}
export declare function createService(projectDir: string, targetFile?: string | readonly string[]): Service;
/** Convert 1-indexed line:character to 0-indexed offset */
export declare function toPosition(sourceFile: ts.SourceFile, line: number, character: number): number;
/** Convert 0-indexed offset to 1-indexed { line, character } */
export declare function fromPosition(sourceFile: ts.SourceFile, offset: number): {
    line: number;
    character: number;
};
/** Get relative path from project root */
export declare function relativePath(projectRoot: string, filePath: string): string;
