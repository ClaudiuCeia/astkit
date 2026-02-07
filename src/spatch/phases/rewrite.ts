import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectPatchableFiles } from "../files.ts";
import {
  compileTemplate,
  findTemplateMatches,
  renderTemplate,
} from "../../pattern/index.ts";
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

export async function rewriteProject(
  patch: ParsedPatchSpec,
  options: SpatchOptions,
): Promise<RewritePhaseResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? ".";
  const dryRun = options.dryRun ?? false;
  const encoding = options.encoding ?? "utf8";
  const resolvedScope = path.resolve(cwd, scope);
  const compiledPattern = compileTemplate(patch.pattern);
  const files = await collectPatchableFiles({
    cwd,
    scope,
    extensions: options.extensions,
    excludedDirectories: options.excludedDirectories,
  });

  let filesMatched = 0;
  let filesChanged = 0;
  let totalMatches = 0;
  let totalReplacements = 0;
  const fileResults: SpatchFileResult[] = [];

  for (const filePath of files) {
    const fileResult = await rewriteFile({
      cwd,
      filePath,
      replacementTemplate: patch.replacement,
      compiledPattern,
      encoding,
      dryRun,
    });

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
};

async function rewriteFile(
  input: RewriteFileInput,
): Promise<SpatchFileResult | null> {
  const originalText = await readFile(input.filePath, input.encoding);
  const matches = findTemplateMatches(originalText, input.compiledPattern);
  if (matches.length === 0) {
    return null;
  }

  const lineStarts = createLineStarts(originalText);
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
      captures: match.captures,
    };
  });

  const replacementCount = occurrences.reduce(
    (count, occurrence) =>
      count + (occurrence.matched === occurrence.replacement ? 0 : 1),
    0,
  );
  const rewrittenText = applyOccurrences(originalText, occurrences);
  const changed = rewrittenText !== originalText;

  if (changed && !input.dryRun) {
    await writeFile(input.filePath, rewrittenText, input.encoding);
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
