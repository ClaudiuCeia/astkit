import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectPatchableFiles } from "./files.ts";
import { compileTemplate, findTemplateMatches, renderTemplate } from "./template.ts";
import { createLineStarts, toLineCharacter } from "./text.ts";
import type { SpatchFileResult, SpatchOptions, SpatchResult } from "./types.ts";

export async function patchProject(
  pattern: string,
  replacement: string,
  options: SpatchOptions = {},
): Promise<SpatchResult> {
  const startedAt = Date.now();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? ".";
  const dryRun = options.dryRun ?? false;
  const encoding = options.encoding ?? "utf8";
  const resolvedScope = path.resolve(cwd, scope);
  const compiledPattern = compileTemplate(pattern);
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
    const originalText = await readFile(filePath, encoding);
    const matches = findTemplateMatches(originalText, compiledPattern);
    if (matches.length === 0) {
      continue;
    }

    filesMatched += 1;
    totalMatches += matches.length;
    const lineStarts = createLineStarts(originalText);
    const occurrences = matches.map((match) => {
      const rendered = renderTemplate(replacement, match.captures);
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
    totalReplacements += replacementCount;
    const rewrittenText = applyOccurrences(originalText, occurrences);
    const changed = rewrittenText !== originalText;

    if (changed) {
      filesChanged += 1;
      if (!dryRun) {
        await writeFile(filePath, rewrittenText, encoding);
      }
    }

    fileResults.push({
      file: path.relative(cwd, filePath) || path.basename(filePath),
      matchCount: matches.length,
      replacementCount,
      changed,
      byteDelta: changed
        ? Buffer.byteLength(rewrittenText, encoding) -
          Buffer.byteLength(originalText, encoding)
        : 0,
      occurrences,
    });
  }

  return {
    dryRun,
    scope: resolvedScope,
    pattern,
    replacement,
    filesScanned: files.length,
    filesMatched,
    filesChanged,
    totalMatches,
    totalReplacements,
    elapsedMs: Date.now() - startedAt,
    files: fileResults,
  };
}

export const spatch = patchProject;

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
