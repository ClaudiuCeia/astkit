import { DEFAULT_EXCLUDED_DIRECTORIES, DEFAULT_SOURCE_EXTENSIONS } from "@claudiu-ceia/astkit-core";

/** Default file extensions scanned by `sgrep` when `options.extensions` is not provided. */
export const DEFAULT_SEARCHABLE_EXTENSIONS = DEFAULT_SOURCE_EXTENSIONS;
/** Default directory names excluded from traversal when `options.excludedDirectories` is not provided. */
export const DEFAULT_SEARCH_EXCLUDED_DIRECTORIES = DEFAULT_EXCLUDED_DIRECTORIES;

/** Runtime options for structural search. */
export type SgrepOptions = {
  /** File or directory scope to scan (defaults to `"."`). */
  scope?: string;
  /** Working directory used to resolve `patternInput` and `scope` (defaults to `process.cwd()`). */
  cwd?: string;
  /** File extensions eligible for scanning. */
  extensions?: readonly string[];
  /** Directory names excluded during recursive traversal. */
  excludedDirectories?: readonly string[];
  /** Text encoding used when reading files (defaults to `"utf8"`). */
  encoding?: BufferEncoding;
  /** Enables isomorphism expansion before matching (defaults to `true`). */
  isomorphisms?: boolean;
  /** Maximum number of files processed concurrently (defaults to `8`). */
  concurrency?: number;
  /** Perf logging level (`1` summary, `2` summary + slow files). */
  verbose?: number;
  /** Logger sink used by verbose tracing. */
  logger?: (line: string) => void;
};

/** One matched span and extracted captures in a file. */
export type SgrepMatch = {
  /** Zero-based start offset in the source file. */
  start: number;
  /** Zero-based end offset (exclusive) in the source file. */
  end: number;
  /** One-based line number of the match start. */
  line: number;
  /** One-based character number of the match start. */
  character: number;
  /** Raw matched source snippet. */
  matched: string;
  /** Captured named metavariables from the pattern. */
  captures: Record<string, string>;
};

/** Aggregated search matches for one file. */
export type SgrepFileResult = {
  /** Output path for the file (scope-relative when possible). */
  file: string;
  /** Number of matched spans in `file`. */
  matchCount: number;
  /** Detailed match rows for this file. */
  matches: SgrepMatch[];
};

/** Full result object produced by `searchProject` and CLI JSON mode. */
export type SgrepResult = {
  /** Canonical resolved scan scope. */
  scope: string;
  /** Resolved search pattern text used for matching. */
  pattern: string;
  /** Number of files scanned under scope. */
  filesScanned: number;
  /** Number of files that produced at least one match. */
  filesMatched: number;
  /** Total number of matches across all files. */
  totalMatches: number;
  /** End-to-end search time in milliseconds. */
  elapsedMs: number;
  /** Per-file match breakdown. */
  files: SgrepFileResult[];
};
