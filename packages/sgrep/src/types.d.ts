export declare const DEFAULT_SEARCHABLE_EXTENSIONS: readonly [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
export declare const DEFAULT_SEARCH_EXCLUDED_DIRECTORIES: readonly [".git", "node_modules", ".next", ".turbo", "dist", "build", "coverage", "out"];
export type SgrepOptions = {
    scope?: string;
    cwd?: string;
    extensions?: readonly string[];
    excludedDirectories?: readonly string[];
    encoding?: BufferEncoding;
    isomorphisms?: boolean;
    concurrency?: number;
    verbose?: number;
    logger?: (line: string) => void;
};
export type SgrepMatch = {
    start: number;
    end: number;
    line: number;
    character: number;
    matched: string;
    captures: Record<string, string>;
};
export type SgrepFileResult = {
    file: string;
    matchCount: number;
    matches: SgrepMatch[];
};
export type SgrepResult = {
    scope: string;
    pattern: string;
    filesScanned: number;
    filesMatched: number;
    totalMatches: number;
    elapsedMs: number;
    files: SgrepFileResult[];
};
