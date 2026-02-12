import { buildCommand, numberParser } from "@stricli/core";
import { rankCode, type CodeRankResult } from "./rank.ts";

type CodeRankCommandFlags = {
  cwd?: string;
  limit?: number;
  json?: boolean;
};

export async function runCodeRankCommand(
  scope: string | undefined,
  flags: CodeRankCommandFlags,
): Promise<CodeRankResult> {
  return rankCode({
    cwd: flags.cwd,
    scope: scope ?? ".",
    limit: flags.limit,
  });
}

export function formatCodeRankOutput(result: CodeRankResult): string {
  if (result.symbols.length === 0) {
    return "No ranked symbols.";
  }

  const lines: string[] = [];
  for (let index = 0; index < result.symbols.length; index += 1) {
    const symbol = result.symbols[index];
    if (!symbol) {
      continue;
    }
    const rank = index + 1;
    const safeKind = escapeTerminalText(symbol.kind);
    const safeSymbol = escapeTerminalText(symbol.symbol);
    const safeFile = escapeTerminalText(symbol.file);
    lines.push(
      `${rank}. score=${symbol.score} refs=${symbol.referenceCount} ext=${symbol.externalReferenceCount} files=${symbol.referencingFileCount} ${safeKind} ${safeSymbol} ${safeFile}:${symbol.line}:${symbol.character}`,
    );
  }

  return lines.join("\n");
}

function escapeTerminalText(text: string): string {
  let output = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0x1b || code < 0x20 || code === 0x7f) {
      output += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    output += char;
  }
  return output;
}

export const codeRankCommand = buildCommand({
  async func(
    this: { process: { stdout: { write(s: string): void } } },
    flags: CodeRankCommandFlags,
    scope?: string,
  ) {
    const result = await runCodeRankCommand(scope, flags);

    if (flags.json ?? false) {
      this.process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    this.process.stdout.write(`${formatCodeRankOutput(result)}\n`);
  },
  parameters: {
    flags: {
      json: {
        kind: "boolean" as const,
        optional: true,
        brief: "Output structured JSON instead of compact text",
      },
      limit: {
        kind: "parsed" as const,
        optional: true,
        brief: "Maximum number of ranked symbols to return",
        placeholder: "n",
        parse: numberParser,
      },
      cwd: {
        kind: "parsed" as const,
        optional: true,
        brief: "Working directory for resolving scope",
        placeholder: "path",
        parse: (input: string) => input,
      },
    },
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "Scope file or directory (defaults to current directory)",
          placeholder: "scope",
          parse: (input: string) => input,
          optional: true,
        },
      ],
    },
  },
  docs: {
    brief: "Rank exported symbols by reference strength",
  },
});
