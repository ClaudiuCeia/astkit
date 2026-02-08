export const DEFAULT_PATCHABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export const DEFAULT_EXCLUDED_DIRECTORIES = [
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "out",
] as const;

export type SpatchOptions = {
  scope?: string;
  cwd?: string;
  dryRun?: boolean;
  extensions?: readonly string[];
  excludedDirectories?: readonly string[];
  encoding?: BufferEncoding;
  concurrency?: number;
  verbose?: number;
  logger?: (line: string) => void;
};

export type SpatchOccurrence = {
  start: number;
  end: number;
  line: number;
  character: number;
  matched: string;
  replacement: string;
  captures: Record<string, string>;
};

export type SpatchFileResult = {
  file: string;
  matchCount: number;
  replacementCount: number;
  changed: boolean;
  byteDelta: number;
  occurrences: SpatchOccurrence[];
};

export type SpatchResult = {
  dryRun: boolean;
  scope: string;
  pattern: string;
  replacement: string;
  filesScanned: number;
  filesMatched: number;
  filesChanged: number;
  totalMatches: number;
  totalReplacements: number;
  elapsedMs: number;
  files: SpatchFileResult[];
};
