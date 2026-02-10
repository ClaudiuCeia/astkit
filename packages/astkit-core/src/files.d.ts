export declare const DEFAULT_SOURCE_EXTENSIONS: readonly [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
export declare const DEFAULT_EXCLUDED_DIRECTORIES: readonly [".git", "node_modules", ".next", ".turbo", "dist", "build", "coverage", "out"];
export type CollectPatchableFilesOptions = {
    cwd: string;
    scope: string;
    extensions?: readonly string[];
    excludedDirectories?: readonly string[];
};
export declare function collectPatchableFiles(options: CollectPatchableFilesOptions): Promise<string[]>;
