import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectPatchableFiles } from "../files.ts";
import {
  compileTemplate,
  ELLIPSIS_CAPTURE_PREFIX,
  findTemplateMatches,
  renderTemplate,
} from "../../pattern/index.ts";
import { mapLimit } from "../../common/async.ts";
import { formatMs, nowNs, nsToMs } from "../../common/trace.ts";
import { createLineStarts, toLineCharacter } from "../text.ts";
import type { SpatchFileResult, SpatchOptions } from "../types.ts";
import type { ParsedPatchSpec } from "./parse.ts";

export type RewritePhaseResult = {
  cwd: string;
  scope: string;
  dryRun: boolean;
  filesScanned: number;
  filesMatched: number;
  filesChanged: number;
  totalMatches: number;
  totalReplacements: number;
  files: SpatchFileResult[];
};

type RewritePerfStats = {
  filesRead: number;
  readNs: bigint;
  matchNs: bigint;
  renderNs: bigint;
  applyNs: bigint;
  writeNs: bigint;
  matchedFiles: number;
  totalMatches: number;
  totalReplacements: number;
};

export async function rewriteProject(
  patch: ParsedPatchSpec,
  options: SpatchOptions,
): Promise<RewritePhaseResult> {
  const verbose = options.verbose ?? 0;
  const log = options.logger ?? (() => {});
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? ".";
  const dryRun = options.dryRun ?? false;
  const encoding = options.encoding ?? "utf8";
  const concurrency = options.concurrency ?? 8;
  const resolvedScope = path.resolve(cwd, scope);
  const compileStarted = verbose > 0 ? nowNs() : 0n;
  const compiledPattern = compileTemplate(patch.pattern);
  if (verbose > 0) {
    log(
      `[spatch] compilePattern ${formatMs(nsToMs(nowNs() - compileStarted))}`,
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
    log(
      `[spatch] collectFiles ${formatMs(nsToMs(nowNs() - collectStarted))} files=${files.length}`,
    );
  }

  const slowFiles: Array<{ file: string; ms: number; matches: number; replacements: number }> =
    [];
  const stats: RewritePerfStats = {
    filesRead: 0,
    readNs: 0n,
    matchNs: 0n,
    renderNs: 0n,
    applyNs: 0n,
    writeNs: 0n,
    matchedFiles: 0,
    totalMatches: 0,
    totalReplacements: 0,
  };
  const rewriteStarted = verbose > 0 ? nowNs() : 0n;
  const results = await mapLimit(
    files,
    async (filePath) => {
      const perFileStarted = verbose >= 2 ? nowNs() : 0n;
      const fileResult = await rewriteFile({
        cwd,
        filePath,
        replacementTemplate: patch.replacement,
        compiledPattern,
        encoding,
        dryRun,
        stats: verbose > 0 ? stats : undefined,
      });
      if (verbose >= 2 && fileResult) {
        slowFiles.push({
          file: fileResult.file,
          ms: nsToMs(nowNs() - perFileStarted),
          matches: fileResult.matchCount,
          replacements: fileResult.replacementCount,
        });
      }
      return fileResult;
    },
    { concurrency },
  );
  if (verbose > 0) {
    log(
      `[spatch] rewriteFiles ${formatMs(nsToMs(nowNs() - rewriteStarted))} concurrency=${concurrency} dryRun=${dryRun}`,
    );
    log(
      `[spatch] breakdown read=${formatMs(nsToMs(stats.readNs))} match=${formatMs(nsToMs(stats.matchNs))} render=${formatMs(nsToMs(stats.renderNs))} apply=${formatMs(nsToMs(stats.applyNs))} write=${formatMs(nsToMs(stats.writeNs))}`,
    );
  }

  let filesMatched = 0;
  let filesChanged = 0;
  let totalMatches = 0;
  let totalReplacements = 0;
  const fileResults: SpatchFileResult[] = [];
  for (const fileResult of results) {
    if (!fileResult) {
      continue;
    }

    filesMatched += 1;
    totalMatches += fileResult.matchCount;
    totalReplacements += fileResult.replacementCount;
    if (fileResult.changed) {
      filesChanged += 1;
    }

    fileResults.push(fileResult);
  }

  if (verbose >= 2 && slowFiles.length > 0) {
    slowFiles.sort((a, b) => b.ms - a.ms);
    for (const entry of slowFiles.slice(0, 10)) {
      log(
        `[spatch] slowFile ${formatMs(entry.ms)} file=${entry.file} matches=${entry.matches} replacements=${entry.replacements}`,
      );
    }
  }

  if (verbose > 0) {
    log(
      `[spatch] summary filesScanned=${files.length} filesMatched=${filesMatched} filesChanged=${filesChanged} totalMatches=${totalMatches} totalReplacements=${totalReplacements}`,
    );
  }

  return {
    cwd,
    scope: resolvedScope,
    dryRun,
    filesScanned: files.length,
    filesMatched,
    filesChanged,
    totalMatches,
    totalReplacements,
    files: fileResults,
  };
}

type RewriteFileInput = {
  cwd: string;
  filePath: string;
  replacementTemplate: string;
  compiledPattern: ReturnType<typeof compileTemplate>;
  encoding: BufferEncoding;
  dryRun: boolean;
  stats?: RewritePerfStats;
};

async function rewriteFile(
  input: RewriteFileInput,
): Promise<SpatchFileResult | null> {
  const readStarted = input.stats ? nowNs() : 0n;
  const originalText = await readFile(input.filePath, input.encoding);
  if (input.stats) {
    input.stats.filesRead += 1;
    input.stats.readNs += nowNs() - readStarted;
  }

  const matchStarted = input.stats ? nowNs() : 0n;
  const matches = findTemplateMatches(originalText, input.compiledPattern);
  if (input.stats) {
    input.stats.matchNs += nowNs() - matchStarted;
  }
  if (matches.length === 0) {
    return null;
  }

  const lineStarts = createLineStarts(originalText);
  const renderStarted = input.stats ? nowNs() : 0n;
  const occurrences = matches.map((match) => {
    const rendered = renderTemplate(input.replacementTemplate, match.captures);
    const { line, character } = toLineCharacter(lineStarts, match.start);
    return {
      start: match.start,
      end: match.end,
      line,
      character,
      matched: match.text,
      replacement: rendered,
      captures: filterPublicCaptures(match.captures),
    };
  });
  if (input.stats) {
    input.stats.renderNs += nowNs() - renderStarted;
  }

  const replacementCount = occurrences.reduce(
    (count, occurrence) =>
      count + (occurrence.matched === occurrence.replacement ? 0 : 1),
    0,
  );
  const applyStarted = input.stats ? nowNs() : 0n;
  const rewrittenText = applyOccurrences(originalText, occurrences);
  if (input.stats) {
    input.stats.applyNs += nowNs() - applyStarted;
  }
  const changed = rewrittenText !== originalText;

  if (changed && !input.dryRun) {
    const writeStarted = input.stats ? nowNs() : 0n;
    await writeFile(input.filePath, rewrittenText, input.encoding);
    if (input.stats) {
      input.stats.writeNs += nowNs() - writeStarted;
    }
  }

  if (input.stats) {
    input.stats.matchedFiles += 1;
    input.stats.totalMatches += matches.length;
    input.stats.totalReplacements += replacementCount;
  }

  return {
    file: path.relative(input.cwd, input.filePath) || path.basename(input.filePath),
    matchCount: matches.length,
    replacementCount,
    changed,
    byteDelta: changed
      ? Buffer.byteLength(rewrittenText, input.encoding) -
        Buffer.byteLength(originalText, input.encoding)
      : 0,
    occurrences,
  };
}

function filterPublicCaptures(
  captures: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(captures).filter(
    ([name]) => !name.startsWith(ELLIPSIS_CAPTURE_PREFIX),
  );
  return Object.fromEntries(entries);
}

function applyOccurrences(
  source: string,
  occurrences: ReadonlyArray<{ start: number; end: number; replacement: string }>,
): string {
  if (occurrences.length === 0) {
    return source;
  }

  const parts: string[] = [];
  let cursor = 0;

  for (const occurrence of occurrences) {
    parts.push(source.slice(cursor, occurrence.start));
    parts.push(occurrence.replacement);
    cursor = occurrence.end;
  }

  parts.push(source.slice(cursor));
  return parts.join("");
}
