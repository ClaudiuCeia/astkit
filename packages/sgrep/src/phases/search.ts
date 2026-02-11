import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  compileTemplate,
  ELLIPSIS_CAPTURE_PREFIX,
  collectPatchableFiles,
  createLineStarts,
  findTemplateMatches,
  formatMs,
  mapLimit,
  nowNs,
  nsToMs,
  toLineCharacter,
  type TemplateMatch,
} from "@claudiu-ceia/astkit-core";
import { expandPatternIsomorphisms } from "../isomorphisms/index.ts";
import type { SgrepFileResult, SgrepOptions } from "../types.ts";
import type { ParsedSearchSpec } from "./parse.ts";

export type SearchPhaseResult = {
  cwd: string;
  scope: string;
  filesScanned: number;
  filesMatched: number;
  totalMatches: number;
  files: SgrepFileResult[];
};

type SearchPerfStats = {
  filesRead: number;
  readNs: bigint;
  matchNs: bigint;
  postNs: bigint;
  matchedFiles: number;
  totalMatches: number;
};

export async function searchProjectFiles(
  search: ParsedSearchSpec,
  options: SgrepOptions,
): Promise<SearchPhaseResult> {
  const verbose = options.verbose ?? 0;
  const log = options.logger ?? (() => {});
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? ".";
  const encoding = options.encoding ?? "utf8";
  const concurrency = options.concurrency ?? 8;
  const resolvedScope = path.resolve(cwd, scope);
  const isomorphismsEnabled = options.isomorphisms ?? true;
  const compileStarted = verbose > 0 ? nowNs() : 0n;
  const compiledPatterns = compileSearchPatterns(search.pattern, isomorphismsEnabled);
  if (verbose > 0) {
    log(
      `[sgrep] compilePatterns ${formatMs(nsToMs(nowNs() - compileStarted))} variants=${compiledPatterns.length} isomorphisms=${isomorphismsEnabled}`,
    );
  }

  const collectStarted = verbose > 0 ? nowNs() : 0n;
  const files = await collectPatchableFiles({
    cwd,
    scope,
    extensions: options.extensions,
    excludedDirectories: options.excludedDirectories,
  });
  if (verbose > 0) {
    log(`[sgrep] collectFiles ${formatMs(nsToMs(nowNs() - collectStarted))} files=${files.length}`);
  }

  const slowFiles: Array<{ file: string; ms: number; matches: number }> = [];
  const stats: SearchPerfStats = {
    filesRead: 0,
    readNs: 0n,
    matchNs: 0n,
    postNs: 0n,
    matchedFiles: 0,
    totalMatches: 0,
  };
  const scanStarted = verbose > 0 ? nowNs() : 0n;
  const results = await mapLimit(
    files,
    async (filePath) => {
      const perFileStarted = verbose >= 2 ? nowNs() : 0n;
      const fileResult = await searchFile({
        cwd,
        filePath,
        compiledPatterns,
        encoding,
        stats: verbose > 0 ? stats : undefined,
      });
      if (verbose >= 2 && fileResult) {
        slowFiles.push({
          file: fileResult.file,
          ms: nsToMs(nowNs() - perFileStarted),
          matches: fileResult.matchCount,
        });
      }
      return fileResult;
    },
    { concurrency },
  );
  if (verbose > 0) {
    log(`[sgrep] scanFiles ${formatMs(nsToMs(nowNs() - scanStarted))} concurrency=${concurrency}`);
    // Cumulative times can exceed wall-clock with concurrency (IO overlap),
    // but they're still useful to show where work is spent.
    log(
      `[sgrep] breakdown read=${formatMs(nsToMs(stats.readNs))} match=${formatMs(nsToMs(stats.matchNs))} post=${formatMs(nsToMs(stats.postNs))}`,
    );
  }

  let filesMatched = 0;
  let totalMatches = 0;
  const fileResults: SgrepFileResult[] = [];
  for (const fileResult of results) {
    if (!fileResult) {
      continue;
    }
    filesMatched += 1;
    totalMatches += fileResult.matchCount;
    fileResults.push(fileResult);
  }

  if (verbose >= 2 && slowFiles.length > 0) {
    slowFiles.sort((a, b) => b.ms - a.ms);
    for (const entry of slowFiles.slice(0, 10)) {
      log(`[sgrep] slowFile ${formatMs(entry.ms)} file=${entry.file} matches=${entry.matches}`);
    }
  }

  if (verbose > 0) {
    log(
      `[sgrep] summary filesScanned=${files.length} filesMatched=${filesMatched} totalMatches=${totalMatches}`,
    );
  }

  return {
    cwd,
    scope: resolvedScope,
    filesScanned: files.length,
    filesMatched,
    totalMatches,
    files: fileResults,
  };
}

type SearchFileInput = {
  cwd: string;
  filePath: string;
  compiledPatterns: ReturnType<typeof compileTemplate>[];
  encoding: BufferEncoding;
  stats?: SearchPerfStats;
};

async function searchFile(input: SearchFileInput): Promise<SgrepFileResult | null> {
  const readStarted = input.stats ? nowNs() : 0n;
  const sourceText = await readFile(input.filePath, input.encoding);
  if (input.stats) {
    input.stats.filesRead += 1;
    input.stats.readNs += nowNs() - readStarted;
  }

  const matchStarted = input.stats ? nowNs() : 0n;
  const matches = findFileMatches(sourceText, input.compiledPatterns);
  if (input.stats) {
    input.stats.matchNs += nowNs() - matchStarted;
  }
  if (matches.length === 0) {
    return null;
  }

  const postStarted = input.stats ? nowNs() : 0n;
  const lineStarts = createLineStarts(sourceText);
  const searchMatches = matches.map((match) => {
    const { line, character } = toLineCharacter(lineStarts, match.start);
    return {
      start: match.start,
      end: match.end,
      line,
      character,
      matched: match.text,
      captures: filterPublicCaptures(match.captures),
    };
  });
  if (input.stats) {
    input.stats.postNs += nowNs() - postStarted;
    input.stats.matchedFiles += 1;
    input.stats.totalMatches += matches.length;
  }

  return {
    file: path.relative(input.cwd, input.filePath) || path.basename(input.filePath),
    matchCount: matches.length,
    matches: searchMatches,
  };
}

function filterPublicCaptures(captures: Record<string, string>): Record<string, string> {
  const entries = Object.entries(captures).filter(
    ([name]) => !name.startsWith(ELLIPSIS_CAPTURE_PREFIX),
  );
  return Object.fromEntries(entries);
}

function compileSearchPatterns(
  pattern: string,
  withIsomorphisms: boolean,
): ReturnType<typeof compileTemplate>[] {
  const variants = expandPatternIsomorphisms(pattern, {
    enabled: withIsomorphisms,
  });
  const compiledPatterns: ReturnType<typeof compileTemplate>[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    if (!variant || seen.has(variant)) {
      continue;
    }
    seen.add(variant);

    try {
      compiledPatterns.push(compileTemplate(variant));
    } catch (error) {
      if (variant === pattern || index === 0) {
        throw error;
      }
    }
  }

  if (compiledPatterns.length === 0) {
    throw new Error("Unable to compile search pattern.");
  }

  return compiledPatterns;
}

function findFileMatches(
  sourceText: string,
  compiledPatterns: readonly ReturnType<typeof compileTemplate>[],
): TemplateMatch[] {
  const uniqueBySpan = new Map<string, TemplateMatch>();

  for (const compiledPattern of compiledPatterns) {
    const matches = findTemplateMatches(sourceText, compiledPattern);
    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      if (!uniqueBySpan.has(key)) {
        uniqueBySpan.set(key, match);
      }
    }
  }

  return [...uniqueBySpan.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}
