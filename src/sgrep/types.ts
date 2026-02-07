import {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_PATCHABLE_EXTENSIONS,
} from "../spatch/types.ts";

export const DEFAULT_SEARCHABLE_EXTENSIONS = DEFAULT_PATCHABLE_EXTENSIONS;
export const DEFAULT_SEARCH_EXCLUDED_DIRECTORIES = DEFAULT_EXCLUDED_DIRECTORIES;

export type SgrepOptions = {
  scope?: string;
  cwd?: string;
  extensions?: readonly string[];
  excludedDirectories?: readonly string[];
  encoding?: BufferEncoding;
  isomorphisms?: boolean;
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
