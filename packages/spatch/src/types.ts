export {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_SOURCE_EXTENSIONS as DEFAULT_PATCHABLE_EXTENSIONS,
} from "@claudiu-ceia/astkit-core";

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
