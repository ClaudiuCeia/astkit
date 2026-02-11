import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { writeFileIfUnchangedAtomically } from "../../file-write.ts";
import { applyReplacementSpans } from "../../replacement-spans.ts";
import { patchProject } from "../../spatch.ts";
import type { SpatchFileResult, SpatchOccurrence, SpatchResult } from "../../types.ts";
import { resolveInteractiveFilePath } from "./path-resolution.ts";
import { createTerminalInteractiveDecider } from "./terminal.ts";
import type { RunInteractivePatchCommandOptions } from "./types.ts";
import { validateSelectedOccurrences } from "./validation.ts";

type PreparedInteractiveFile = {
  absolutePath: string;
  originalText: string;
  rewrittenText: string;
  changed: boolean;
  replacementCount: number;
  selected: SpatchOccurrence[];
};

export async function runInteractivePatchCommand(
  patchInput: string,
  options: RunInteractivePatchCommandOptions,
): Promise<SpatchResult> {
  const scope = options.scope ?? ".";
  const cwd = options.cwd;
  const resolvedCwd = path.resolve(cwd ?? process.cwd());
  const resolvedScope = path.resolve(resolvedCwd, scope);
  const resolvedScopeStats = await stat(resolvedScope);
  const scopeKind: "file" | "directory" = resolvedScopeStats.isFile()
    ? "file"
    : resolvedScopeStats.isDirectory()
      ? "directory"
      : (() => {
          throw new Error(`Scope must resolve to a file or directory: ${resolvedScope}`);
        })();
  const encoding = options.encoding ?? "utf8";
  const noColor = options.noColor;
  const interactiveDecider = options.interactiveDecider;

  if (!interactiveDecider && (!processStdin.isTTY || !processStdout.isTTY)) {
    throw new Error("Interactive mode requires a TTY stdin/stdout.");
  }

  const startedAt = Date.now();
  const dryResult = await patchProject(patchInput, {
    concurrency: options.concurrency,
    cwd,
    dryRun: true,
    encoding: options.encoding,
    logger: options.logger,
    scope,
    verbose: options.verbose,
  });
  const totalChanges = dryResult.files.reduce(
    (count, file) =>
      count +
      file.occurrences.filter((occurrence) => occurrence.matched !== occurrence.replacement).length,
    0,
  );

  let interactivePrompt: Awaited<ReturnType<typeof createTerminalInteractiveDecider>> | null = null;
  const decider =
    interactiveDecider ??
    ((interactivePrompt = await createTerminalInteractiveDecider(noColor)),
    interactivePrompt.decider);
  const selectedByFile = new Map<string, SpatchOccurrence[]>();
  let applyAll = false;
  let stop = false;
  let changeNumber = 0;

  try {
    for (const file of dryResult.files) {
      const selected: SpatchOccurrence[] = [];

      for (const occurrence of file.occurrences) {
        if (occurrence.matched === occurrence.replacement) {
          continue;
        }
        changeNumber += 1;

        if (applyAll) {
          selected.push(occurrence);
          continue;
        }

        const choice = await decider({
          file: file.file,
          occurrence,
          changeNumber,
          totalChanges,
        });

        if (choice === "yes") {
          selected.push(occurrence);
          continue;
        }

        if (choice === "all") {
          applyAll = true;
          selected.push(occurrence);
          continue;
        }

        if (choice === "quit") {
          stop = true;
          break;
        }
      }

      selectedByFile.set(file.file, selected);
      if (stop) {
        break;
      }
    }
  } finally {
    interactivePrompt?.close();
  }

  const fileResults: SpatchFileResult[] = [];
  let filesChanged = 0;
  let totalReplacements = 0;
  const preparedByFile = new Map<string, PreparedInteractiveFile>();

  for (const file of dryResult.files) {
    const selected = selectedByFile.get(file.file) ?? [];
    if (selected.length === 0) {
      continue;
    }

    const absolutePath = await resolveInteractiveFilePath(file.file, {
      cwd: resolvedCwd,
      scope: resolvedScope,
      scopeKind,
    });
    const originalText = await readFile(absolutePath, encoding);
    validateSelectedOccurrences(file.file, originalText, selected);
    const rewrittenText = applyReplacementSpans(originalText, selected);
    const changed = rewrittenText !== originalText;
    const replacementCount = selected.filter(
      (occurrence) => occurrence.matched !== occurrence.replacement,
    ).length;
    preparedByFile.set(file.file, {
      absolutePath,
      originalText,
      rewrittenText,
      changed,
      replacementCount,
      selected,
    });
  }

  for (const file of dryResult.files) {
    const selected = selectedByFile.get(file.file) ?? [];
    if (selected.length === 0) {
      fileResults.push({
        ...file,
        replacementCount: 0,
        changed: false,
        byteDelta: 0,
        occurrences: [],
      });
      continue;
    }

    const prepared = preparedByFile.get(file.file);
    if (!prepared) {
      throw new Error(`Missing prepared interactive rewrite state for ${file.file}`);
    }

    if (prepared.changed) {
      await writeFileIfUnchangedAtomically({
        filePath: prepared.absolutePath,
        originalText: prepared.originalText,
        rewrittenText: prepared.rewrittenText,
        encoding,
        operationName: "interactive patch apply",
      });
    }

    fileResults.push({
      ...file,
      replacementCount: prepared.replacementCount,
      changed: prepared.changed,
      byteDelta: prepared.changed
        ? Buffer.byteLength(prepared.rewrittenText, encoding) -
          Buffer.byteLength(prepared.originalText, encoding)
        : 0,
      occurrences: prepared.selected,
    });

    totalReplacements += prepared.replacementCount;
    if (prepared.changed) {
      filesChanged += 1;
    }
  }

  return {
    ...dryResult,
    dryRun: false,
    filesChanged,
    totalReplacements,
    elapsedMs: Date.now() - startedAt,
    files: fileResults,
  };
}
