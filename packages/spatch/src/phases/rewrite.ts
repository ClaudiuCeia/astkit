import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compileReplacementTemplate,
  compileTemplate,
  type CompiledReplacementTemplate,
  ELLIPSIS_CAPTURE_PREFIX,
  findTemplateMatches,
  renderCompiledTemplate,
  collectPatchableFiles,
  createLineStarts,
  formatMs,
  mapLimit,
  nowNs,
  nsToMs,
  toLineCharacter,
} from "@claudiu-ceia/astkit-core";
import { applyReplacementSpans } from "../replacement-spans.ts";
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

type LineEnding = "\n" | "\r\n";

type RewritePerfStats = {
  readNs: bigint;
  matchNs: bigint;
  renderNs: bigint;
  applyNs: bigint;
  writeNs: bigint;
};

type BeforeWriteFileHook = (input: {
  filePath: string;
  originalText: string;
  rewrittenText: string;
}) => Promise<void> | void;

type InternalRewriteOptions = SpatchOptions & {
  __beforeWriteFile?: BeforeWriteFileHook;
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
  const beforeWriteFile = (options as InternalRewriteOptions).__beforeWriteFile;
  const resolvedScope = path.resolve(cwd, scope);
  const repoRoot = await findNearestGitRepoRoot(cwd);
  const scopeBoundary = repoRoot ?? cwd;
  if (!isPathWithinBase(scopeBoundary, resolvedScope)) {
    if (repoRoot) {
      throw new Error(
        `Scope resolves outside repository root: scope=${resolvedScope} repoRoot=${repoRoot}.`,
      );
    }
    throw new Error(`Scope resolves outside cwd: scope=${resolvedScope} cwd=${cwd}.`);
  }
  const compileStarted = verbose > 0 ? nowNs() : 0n;
  const patchVariants = new Map<
    LineEnding,
    {
      compiledPattern: ReturnType<typeof compileTemplate>;
      compiledReplacement: CompiledReplacementTemplate;
    }
  >();
  patchVariants.set("\n", {
    compiledPattern: compileTemplate(patch.pattern),
    compiledReplacement: compileReplacementTemplate(patch.replacement),
  });
  if (verbose > 0) {
    log(`[spatch] compilePattern ${formatMs(nsToMs(nowNs() - compileStarted))}`);
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

  const slowFiles: Array<{ file: string; ms: number; matches: number; replacements: number }> = [];
  const stats: RewritePerfStats = {
    readNs: 0n,
    matchNs: 0n,
    renderNs: 0n,
    applyNs: 0n,
    writeNs: 0n,
  };
  const rewriteStarted = verbose > 0 ? nowNs() : 0n;
  const results = await mapLimit(
    files,
    async (filePath) => {
      const perFileStarted = verbose >= 2 ? nowNs() : 0n;
      const fileResult = await rewriteFile({
        cwd,
        scopePath: resolvedScope,
        filePath,
        patternTemplate: patch.pattern,
        replacementTemplate: patch.replacement,
        patchVariants,
        encoding,
        dryRun,
        beforeWriteFile,
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
    const mode = dryRun ? "preview" : "apply";
    const outcome = totalReplacements === 0 ? "no-op" : "rewrite";
    const matchRate = files.length === 0 ? 0 : (filesMatched / files.length) * 100;
    const changeRate = files.length === 0 ? 0 : (filesChanged / files.length) * 100;
    log(
      `[spatch] summary mode=${mode} outcome=${outcome} flow=${files.length}->${filesMatched}->${filesChanged} rates=match:${matchRate.toFixed(1)}%,change:${changeRate.toFixed(1)}% totals=matches:${totalMatches},replacements:${totalReplacements}`,
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
  scopePath: string;
  filePath: string;
  patternTemplate: string;
  replacementTemplate: string;
  patchVariants: Map<
    LineEnding,
    {
      compiledPattern: ReturnType<typeof compileTemplate>;
      compiledReplacement: CompiledReplacementTemplate;
    }
  >;
  encoding: BufferEncoding;
  dryRun: boolean;
  beforeWriteFile?: BeforeWriteFileHook;
  stats?: RewritePerfStats;
};

async function rewriteFile(input: RewriteFileInput): Promise<SpatchFileResult | null> {
  const readStarted = input.stats ? nowNs() : 0n;
  const originalText = await readFile(input.filePath, input.encoding);
  if (input.stats) {
    input.stats.readNs += nowNs() - readStarted;
  }

  const lineEnding = detectLineEnding(originalText);
  const patchVariant = resolvePatchVariant({
    patternTemplate: input.patternTemplate,
    replacementTemplate: input.replacementTemplate,
    lineEnding,
    patchVariants: input.patchVariants,
  });

  const matchStarted = input.stats ? nowNs() : 0n;
  const matches = findTemplateMatches(originalText, patchVariant.compiledPattern);
  if (input.stats) {
    input.stats.matchNs += nowNs() - matchStarted;
  }
  if (matches.length === 0) {
    return null;
  }

  const lineStarts = createLineStarts(originalText);
  const renderStarted = input.stats ? nowNs() : 0n;
  const occurrences = matches.map((match) => {
    const rendered = renderCompiledTemplate(patchVariant.compiledReplacement, match.captures);
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
    (count, occurrence) => count + (occurrence.matched === occurrence.replacement ? 0 : 1),
    0,
  );
  const applyStarted = input.stats ? nowNs() : 0n;
  const rewrittenText = applyReplacementSpans(originalText, occurrences);
  if (input.stats) {
    input.stats.applyNs += nowNs() - applyStarted;
  }
  const changed = rewrittenText !== originalText;

  if (changed && !input.dryRun) {
    await input.beforeWriteFile?.({
      filePath: input.filePath,
      originalText,
      rewrittenText,
    });

    const writeStarted = input.stats ? nowNs() : 0n;
    await writeFileIfUnchangedAtomically({
      filePath: input.filePath,
      originalText,
      rewrittenText,
      encoding: input.encoding,
    });
    if (input.stats) {
      input.stats.writeNs += nowNs() - writeStarted;
    }
  }

  return {
    file: toDisplayFilePath(input),
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

function filterPublicCaptures(captures: Record<string, string>): Record<string, string> {
  const entries = Object.entries(captures).filter(
    ([name]) => !name.startsWith(ELLIPSIS_CAPTURE_PREFIX),
  );
  return Object.fromEntries(entries);
}

async function findNearestGitRepoRoot(startDirectory: string): Promise<string | null> {
  let current = path.resolve(startDirectory);

  while (true) {
    try {
      await stat(path.join(current, ".git"));
      return current;
    } catch {
      // Move upward to find nearest git root.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

type AtomicWriteInput = {
  filePath: string;
  originalText: string;
  rewrittenText: string;
  encoding: BufferEncoding;
};

async function writeFileIfUnchangedAtomically(input: AtomicWriteInput): Promise<void> {
  let currentText: string;
  try {
    currentText = await readFile(input.filePath, input.encoding);
  } catch {
    throw buildStaleApplyError(input.filePath);
  }
  if (currentText !== input.originalText) {
    throw buildStaleApplyError(input.filePath);
  }

  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(input.filePath);
  } catch {
    throw buildStaleApplyError(input.filePath);
  }

  const tempPath = buildAtomicTempPath(input.filePath);
  await writeFile(tempPath, input.rewrittenText, {
    encoding: input.encoding,
    mode: fileStats.mode,
  });

  try {
    await rename(tempPath, input.filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function buildAtomicTempPath(filePath: string): string {
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);
  return path.join(directory, `.${fileName}.spatch-${process.pid}-${randomUUID()}.tmp`);
}

function buildStaleApplyError(filePath: string): Error {
  return new Error(
    `File changed during non-interactive patch apply: ${filePath}. Re-run spatch to avoid overwriting concurrent edits.`,
  );
}

function toDisplayFilePath(input: { cwd: string; scopePath: string; filePath: string }): string {
  const relativeToCwd = path.relative(input.cwd, input.filePath);
  if (isRelativeWithinBase(relativeToCwd)) {
    return relativeToCwd.length > 0 ? relativeToCwd : path.basename(input.filePath);
  }

  const relativeToScope = path.relative(input.scopePath, input.filePath);
  if (isRelativeWithinBase(relativeToScope)) {
    return relativeToScope.length > 0 ? relativeToScope : path.basename(input.filePath);
  }

  return input.filePath;
}

function isRelativeWithinBase(relativePath: string): boolean {
  if (relativePath.length === 0) {
    return true;
  }

  if (path.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`);
}

function isPathWithinBase(basePath: string, candidatePath: string): boolean {
  const relativePath = path.relative(basePath, candidatePath);
  return isRelativeWithinBase(relativePath);
}

function detectLineEnding(text: string): LineEnding {
  const newlineIndex = text.indexOf("\n");
  if (newlineIndex > 0 && text[newlineIndex - 1] === "\r") {
    return "\r\n";
  }
  return "\n";
}

function resolvePatchVariant(input: {
  patternTemplate: string;
  replacementTemplate: string;
  lineEnding: LineEnding;
  patchVariants: Map<
    LineEnding,
    {
      compiledPattern: ReturnType<typeof compileTemplate>;
      compiledReplacement: CompiledReplacementTemplate;
    }
  >;
}): {
  compiledPattern: ReturnType<typeof compileTemplate>;
  compiledReplacement: CompiledReplacementTemplate;
} {
  const cached = input.patchVariants.get(input.lineEnding);
  if (cached) {
    return cached;
  }

  const pattern = applyLineEnding(input.patternTemplate, input.lineEnding);
  const replacementTemplate = applyLineEnding(input.replacementTemplate, input.lineEnding);
  const variant = {
    compiledPattern: compileTemplate(pattern),
    compiledReplacement: compileReplacementTemplate(replacementTemplate),
  };
  input.patchVariants.set(input.lineEnding, variant);
  return variant;
}

function applyLineEnding(text: string, lineEnding: LineEnding): string {
  if (lineEnding === "\n") {
    return text;
  }
  return text.replaceAll("\n", "\r\n");
}
