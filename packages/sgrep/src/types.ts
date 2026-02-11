import { DEFAULT_EXCLUDED_DIRECTORIES, DEFAULT_SOURCE_EXTENSIONS } from "@claudiu-ceia/astkit-core";

export const DEFAULT_SEARCHABLE_EXTENSIONS = DEFAULT_SOURCE_EXTENSIONS;
export const DEFAULT_SEARCH_EXCLUDED_DIRECTORIES = DEFAULT_EXCLUDED_DIRECTORIES;

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
