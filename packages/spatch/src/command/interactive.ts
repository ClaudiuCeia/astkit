import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { patchProject } from "../spatch.ts";
import type { SpatchFileResult, SpatchOccurrence, SpatchOptions, SpatchResult } from "../types.ts";
import { buildChalk, countLines, splitDiffLines, type FormatPatchOutputOptions } from "./output.ts";

export type InteractiveChoice = "yes" | "no" | "all" | "quit";

export type InteractiveContext = {
  file: string;
  occurrence: SpatchOccurrence;
  changeNumber: number;
  totalChanges: number;
};

export type InteractiveDecider = (ctx: InteractiveContext) => Promise<InteractiveChoice>;

export type RunInteractivePatchCommandOptions = Pick<
  SpatchOptions,
  "concurrency" | "cwd" | "encoding" | "logger" | "scope" | "verbose"
> & {
  noColor: boolean;
  interactiveDecider?: InteractiveDecider;
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
    const rewrittenText = applySelectedOccurrences(originalText, selected);
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
      await writeFile(prepared.absolutePath, prepared.rewrittenText, encoding);
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

type PreparedInteractiveFile = {
  absolutePath: string;
  originalText: string;
  rewrittenText: string;
  changed: boolean;
  replacementCount: number;
  selected: SpatchOccurrence[];
};

function applySelectedOccurrences(
  source: string,
  occurrences: readonly SpatchOccurrence[],
): string {
  if (occurrences.length === 0) {
    return source;
  }

  const sorted = [...occurrences].sort((left, right) => left.start - right.start);
  const parts: string[] = [];
  let cursor = 0;

  for (const occurrence of sorted) {
    parts.push(source.slice(cursor, occurrence.start));
    parts.push(occurrence.replacement);
    cursor = occurrence.end;
  }

  parts.push(source.slice(cursor));
  return parts.join("");
}

async function createTerminalInteractiveDecider(noColor: boolean): Promise<{
  decider: InteractiveDecider;
  close: () => void;
}> {
  const chalkInstance = buildChalk({
    color: processStdout.isTTY && !noColor,
  });
  const useColor = chalkInstance.level > 0;
  const rl = createInterface({
    input: processStdin,
    output: processStdout,
  });

  return {
    decider: async ({ file, occurrence, changeNumber, totalChanges }) => {
      processStdout.write(
        `\n${formatInteractiveChangeBlock(
          { file, occurrence, changeNumber, totalChanges },
          {
            chalkInstance,
            color: useColor,
          },
        )}\n`,
      );

      while (true) {
        const answer = await rl.question(
          useColor
            ? chalkInstance.bold("Choice [y/n/a/q] (default: n): ")
            : "Choice [y/n/a/q] (default: n): ",
        );
        const parsed = parseInteractiveChoice(answer);
        if (parsed) {
          return parsed;
        }

        processStdout.write(
          useColor
            ? `${chalkInstance.yellow("Invalid choice.")} Use y, n, a, or q.\n`
            : "Invalid choice. Use y, n, a, or q.\n",
        );
      }
    },
    close: () => rl.close(),
  };
}

function formatInteractiveChangeBlock(
  ctx: InteractiveContext,
  options: FormatPatchOutputOptions = {},
): string {
  const chalkInstance = buildChalk(options);
  const useColor = chalkInstance.level > 0;
  const divider = "─".repeat(72);
  const oldCount = countLines(ctx.occurrence.matched);
  const newCount = countLines(ctx.occurrence.replacement);
  const hunkHeader = `@@ -${ctx.occurrence.line},${oldCount} +${ctx.occurrence.line},${newCount} @@`;
  const lines = [
    useColor ? chalkInstance.gray(divider) : divider,
    useColor
      ? chalkInstance.bold(
          `Change ${ctx.changeNumber}/${ctx.totalChanges} · ${ctx.file}:${ctx.occurrence.line}:${ctx.occurrence.character}`,
        )
      : `Change ${ctx.changeNumber}/${ctx.totalChanges} · ${ctx.file}:${ctx.occurrence.line}:${ctx.occurrence.character}`,
    useColor ? chalkInstance.cyan(hunkHeader) : hunkHeader,
    ...splitDiffLines(ctx.occurrence.matched).map((line) =>
      useColor ? chalkInstance.red(`-${line}`) : `-${line}`,
    ),
    ...splitDiffLines(ctx.occurrence.replacement).map((line) =>
      useColor ? chalkInstance.green(`+${line}`) : `+${line}`,
    ),
    useColor
      ? chalkInstance.gray("Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit")
      : "Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit",
  ];

  return lines.join("\n");
}

function parseInteractiveChoice(answer: string): InteractiveChoice | null {
  const normalized = answer.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "n" || normalized === "no") {
    return "no";
  }
  if (normalized === "y" || normalized === "yes") {
    return "yes";
  }
  if (normalized === "a" || normalized === "all") {
    return "all";
  }
  if (normalized === "q" || normalized === "quit") {
    return "quit";
  }

  return null;
}

export function validateSelectedOccurrences(
  file: string,
  source: string,
  occurrences: readonly SpatchOccurrence[],
): void {
  const sorted = [...occurrences].sort((left, right) => left.start - right.start);
  let cursor = 0;

  for (const occurrence of sorted) {
    if (
      occurrence.start < 0 ||
      occurrence.end < occurrence.start ||
      occurrence.end > source.length
    ) {
      throw new Error(
        `File changed during interactive patch selection: ${file}. Re-run spatch interactive to refresh match positions.`,
      );
    }
    if (occurrence.start < cursor) {
      throw new Error(
        `Invalid overlapping interactive occurrences for ${file}. Re-run spatch interactive.`,
      );
    }

    const currentMatched = source.slice(occurrence.start, occurrence.end);
    if (currentMatched !== occurrence.matched) {
      throw new Error(
        `File changed during interactive patch selection: ${file}. Re-run spatch interactive to refresh match positions.`,
      );
    }

    cursor = occurrence.end;
  }
}

async function resolveInteractiveFilePath(
  file: string,
  options: { cwd: string; scope: string; scopeKind: "file" | "directory" },
): Promise<string> {
  if (path.isAbsolute(file)) {
    const absolute = path.resolve(file);
    if (isCandidateInScope(absolute, options)) {
      return absolute;
    }
    throw new Error(`Resolved interactive file is outside selected scope: ${file}`);
  }

  const candidates = new Set<string>();
  if (options.scopeKind === "file") {
    candidates.add(options.scope);
    candidates.add(path.resolve(path.dirname(options.scope), file));
  } else {
    candidates.add(path.resolve(options.scope, file));
  }
  candidates.add(path.resolve(options.cwd, file));

  const resolvedCandidates: string[] = [];

  for (const candidate of candidates) {
    if (!isCandidateInScope(candidate, options)) {
      continue;
    }

    try {
      const candidateStats = await stat(candidate);
      if (candidateStats.isFile()) {
        resolvedCandidates.push(candidate);
      }
    } catch {
      // Try next candidate.
    }
  }

  if (resolvedCandidates.length === 1) {
    return resolvedCandidates[0]!;
  }
  if (resolvedCandidates.length > 1) {
    throw new Error(
      `Ambiguous interactive patch target file: ${file}. Re-run spatch interactive with a narrower scope.`,
    );
  }

  throw new Error(
    `Unable to resolve interactive patch target file: ${file}. Re-run spatch interactive.`,
  );
}

function isCandidateInScope(
  candidate: string,
  options: { scope: string; scopeKind: "file" | "directory" },
): boolean {
  if (options.scopeKind === "file") {
    return path.resolve(candidate) === options.scope;
  }

  const relative = path.relative(options.scope, candidate);
  if (relative.length === 0) {
    return true;
  }
  if (path.isAbsolute(relative)) {
    return false;
  }
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}
