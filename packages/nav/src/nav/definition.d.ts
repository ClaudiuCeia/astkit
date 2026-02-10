interface DefinitionLocation {
    file: string;
    line: number;
    character: number;
    kind: string;
    containerName: string;
}
interface DefinitionOutput {
    symbol: string;
    definitions: DefinitionLocation[];
}
export declare function getDefinition(filePath: string, line: number, character: number): DefinitionOutput;
export declare const definitionCommand: import("@stricli/core").Command<import("@stricli/core").CommandContext>;
export {};
