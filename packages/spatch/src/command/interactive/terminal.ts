import { stdin as processStdin, stdout as processStdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import {
  buildChalk,
  countLines,
  escapeTerminalText,
  splitDiffLines,
  type FormatPatchOutputOptions,
} from "../output.ts";
import type { InteractiveChoice, InteractiveContext, InteractiveDecider } from "./types.ts";

export type PromptInterface = {
  question(prompt: string): Promise<string>;
  close(): void;
};

export type TerminalInteractiveDependencies = {
  stdin: Readable & { isTTY?: boolean };
  stdout: Writable & { isTTY?: boolean; write(chunk: string): boolean };
  createPrompt: (options: {
    input: Readable & { isTTY?: boolean };
    output: Writable & { isTTY?: boolean; write(chunk: string): boolean };
  }) => PromptInterface;
};

const defaultTerminalInteractiveDependencies: TerminalInteractiveDependencies = {
  stdin: processStdin,
  stdout: processStdout,
  createPrompt: ({ input, output }) => createInterface({ input, output }),
};

export async function createTerminalInteractiveDecider(
  noColor: boolean,
  dependencies: TerminalInteractiveDependencies = defaultTerminalInteractiveDependencies,
): Promise<{
  decider: InteractiveDecider;
  close: () => void;
}> {
  const chalkInstance = buildChalk({
    color: Boolean(dependencies.stdout.isTTY) && !noColor,
  });
  const useColor = chalkInstance.level > 0;
  const rl = dependencies.createPrompt({
    input: dependencies.stdin,
    output: dependencies.stdout,
  });

  return {
    decider: async ({ file, occurrence, changeNumber, totalChanges }) => {
      dependencies.stdout.write(
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

        dependencies.stdout.write(
          useColor
            ? `${chalkInstance.yellow("Invalid choice.")} Use y, n, a, or q.\n`
            : "Invalid choice. Use y, n, a, or q.\n",
        );
      }
    },
    close: () => rl.close(),
  };
}

export function formatInteractiveChangeBlock(
  ctx: InteractiveContext,
  options: FormatPatchOutputOptions = {},
): string {
  const chalkInstance = buildChalk(options);
  const useColor = chalkInstance.level > 0;
  const safeFile = escapeTerminalText(ctx.file);
  const divider = "─".repeat(72);
  const oldCount = countLines(ctx.occurrence.matched);
  const newCount = countLines(ctx.occurrence.replacement);
  const hunkHeader = `@@ -${ctx.occurrence.line},${oldCount} +${ctx.occurrence.line},${newCount} @@`;
  const lines = [
    useColor ? chalkInstance.gray(divider) : divider,
    useColor
      ? chalkInstance.bold(
          `Change ${ctx.changeNumber}/${ctx.totalChanges} · ${safeFile}:${ctx.occurrence.line}:${ctx.occurrence.character}`,
        )
      : `Change ${ctx.changeNumber}/${ctx.totalChanges} · ${safeFile}:${ctx.occurrence.line}:${ctx.occurrence.character}`,
    useColor ? chalkInstance.cyan(hunkHeader) : hunkHeader,
    ...splitDiffLines(ctx.occurrence.matched).map((line) =>
      useColor ? chalkInstance.red(`-${escapeTerminalText(line)}`) : `-${escapeTerminalText(line)}`,
    ),
    ...splitDiffLines(ctx.occurrence.replacement).map((line) =>
      useColor
        ? chalkInstance.green(`+${escapeTerminalText(line)}`)
        : `+${escapeTerminalText(line)}`,
    ),
    useColor
      ? chalkInstance.gray("Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit")
      : "Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit",
  ];

  return lines.join("\n");
}

export function parseInteractiveChoice(answer: string): InteractiveChoice | null {
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
