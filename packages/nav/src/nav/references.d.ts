interface ReferenceLocation {
    file: string;
    line: number;
    character: number;
    isDefinition: boolean;
    isWriteAccess: boolean;
}
interface ReferencesOutput {
    symbol: string;
    definition: {
        file: string;
        line: number;
        character: number;
    } | null;
    references: ReferenceLocation[];
}
export declare function getReferences(filePath: string, line: number, character: number): ReferencesOutput;
export declare const referencesCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
export {};
