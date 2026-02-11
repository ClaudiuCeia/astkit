import chalk, { Chalk, type ChalkInstance } from "chalk";
import type { SpatchResult } from "../types.ts";

export type FormatPatchOutputOptions = {
  color?: boolean;
  chalkInstance?: ChalkInstance;
};

export function formatPatchOutput(
  result: SpatchResult,
  options: FormatPatchOutputOptions = {},
): string {
  const chalkInstance = buildChalk(options);
  const useColor = chalkInstance.level > 0;
  const lines: string[] = [];
  const changedFiles = result.files.filter((file) => file.replacementCount > 0);

  for (const file of changedFiles) {
    const headerPrefix = useColor ? chalkInstance.bold : (value: string) => value;
    lines.push(headerPrefix(`diff --git a/${file.file} b/${file.file}`));
    lines.push(useColor ? chalkInstance.gray(`--- a/${file.file}`) : `--- a/${file.file}`);
    lines.push(useColor ? chalkInstance.gray(`+++ b/${file.file}`) : `+++ b/${file.file}`);

    for (const occurrence of file.occurrences) {
      if (occurrence.matched === occurrence.replacement) {
        continue;
      }

      const oldCount = countLines(occurrence.matched);
      const newCount = countLines(occurrence.replacement);
      const hunkHeader = `@@ -${occurrence.line},${oldCount} +${occurrence.line},${newCount} @@`;
      lines.push(useColor ? chalkInstance.cyan(hunkHeader) : hunkHeader);

      for (const oldLine of splitDiffLines(occurrence.matched)) {
        const line = `-${oldLine}`;
        lines.push(useColor ? chalkInstance.red(line) : line);
      }

      for (const newLine of splitDiffLines(occurrence.replacement)) {
        const line = `+${newLine}`;
        lines.push(useColor ? chalkInstance.green(line) : line);
      }
    }
  }

  if (changedFiles.length === 0) {
    lines.push(useColor ? chalkInstance.gray("No changes.") : "No changes.");
  }

  const summary = [
    `${result.filesChanged} ${pluralize("file", result.filesChanged)} changed`,
    `${result.totalReplacements} ${pluralize("replacement", result.totalReplacements)}`,
    result.dryRun ? "(dry-run)" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
  lines.push(useColor ? chalkInstance.gray(summary) : summary);

  return lines.join("\n");
}

export function buildChalk(options: FormatPatchOutputOptions): ChalkInstance {
  if (options.chalkInstance) {
    return options.chalkInstance;
  }

  const shouldColor = options.color ?? false;
  if (!shouldColor) {
    return new Chalk({ level: 0 });
  }

  const level = chalk.level > 0 ? chalk.level : 1;
  return new Chalk({ level });
}

export function splitDiffLines(text: string): string[] {
  const normalized = text.replaceAll("\r\n", "\n");
  if (normalized.length === 0) {
    return [];
  }

  if (normalized.endsWith("\n")) {
    return normalized.slice(0, -1).split("\n");
  }

  return normalized.split("\n");
}

export function countLines(text: string): number {
  return splitDiffLines(text).length;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
