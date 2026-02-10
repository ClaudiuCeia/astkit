export type ParsedPatchDocument = {
    pattern: string;
    replacement: string;
    additions: number;
    deletions: number;
    contextLines: number;
    trailingNewline: boolean;
};
export declare function parsePatchDocument(source: string): ParsedPatchDocument;
