import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  stdin as processStdin,
  stdout as processStdout,
} from "node:process";
import { createInterface } from "node:readline/promises";
import { patchProject } from "../spatch.ts";
import type {
  SpatchFileResult,
  SpatchOccurrence,
  SpatchResult,
} from "../types.ts";
import {
  buildChalk,
  countLines,
  splitDiffLines,
  type FormatPatchOutputOptions,
} from "./output.ts";

export type InteractiveChoice = "yes" | "no" | "all" | "quit";

export type InteractiveContext = {
  file: string;
  occurrence: SpatchOccurrence;
  changeNumber: number;
  totalChanges: number;
};

export type InteractiveDecider = (ctx: InteractiveContext) => Promise<InteractiveChoice>;

export async function runInteractivePatchCommand(
  patchInput: string,
  scope: string,
  cwd: string | undefined,
  noColor: boolean,
  interactiveDecider?: InteractiveDecider,
): Promise<SpatchResult> {
  if (!interactiveDecider && (!processStdin.isTTY || !processStdout.isTTY)) {
    throw new Error("Interactive mode requires a TTY stdin/stdout.");
  }

  const startedAt = Date.now();
  const dryResult = await patchProject(patchInput, {
    cwd,
    dryRun: true,
    scope,
  });
  const totalChanges = dryResult.files.reduce(
    (count, file) =>
      count +
      file.occurrences.filter(
        (occurrence) => occurrence.matched !== occurrence.replacement,
      ).length,
    0,
  );

  let interactivePrompt: Awaited<
    ReturnType<typeof createTerminalInteractiveDecider>
  > | null = null;
  const decider =
    interactiveDecider ??
    (
      (interactivePrompt = await createTerminalInteractiveDecider(noColor)),
      interactivePrompt.decider
    );
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

    const absolutePath = path.resolve(cwd ?? process.cwd(), file.file);
    const originalText = await readFile(absolutePath, "utf8");
    const rewrittenText = applySelectedOccurrences(originalText, selected);
    const changed = rewrittenText !== originalText;

    if (changed) {
      await writeFile(absolutePath, rewrittenText, "utf8");
    }

    const replacementCount = selected.filter(
      (occurrence) => occurrence.matched !== occurrence.replacement,
    ).length;
    totalReplacements += replacementCount;
    if (changed) {
      filesChanged += 1;
    }

    fileResults.push({
      ...file,
      replacementCount,
      changed,
      byteDelta: changed
        ? Buffer.byteLength(rewrittenText, "utf8") -
          Buffer.byteLength(originalText, "utf8")
        : 0,
      occurrences: selected,
    });
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

async function createTerminalInteractiveDecider(noColor: boolean): Promise<
  {
    decider: InteractiveDecider;
    close: () => void;
  }
> {
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
      ? chalkInstance.gray(
          "Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit",
        )
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
