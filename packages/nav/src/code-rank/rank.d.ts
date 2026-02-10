export type CodeRankOptions = {
    cwd?: string;
    scope?: string;
    limit?: number;
    extensions?: readonly string[];
    excludedDirectories?: readonly string[];
};
export type RankedSymbol = {
    symbol: string;
    kind: string;
    file: string;
    line: number;
    character: number;
    score: number;
    referenceCount: number;
    internalReferenceCount: number;
    externalReferenceCount: number;
    referencingFileCount: number;
    referencingFiles: string[];
};
export type CodeRankResult = {
    cwd: string;
    scope: string;
    filesScanned: number;
    symbolsScanned: number;
    symbolsRanked: number;
    symbols: RankedSymbol[];
};
export declare function rankCode(options?: CodeRankOptions): Promise<CodeRankResult>;
