import { buildCommand } from "@stricli/core";
import { searchProject } from "../sgrep/sgrep.ts";
import type { SgrepResult } from "../sgrep/types.ts";

export type SearchCommandFlags = {
  cwd?: string;
};

export async function runSearchCommand(
  patternInput: string,
  scope: string | undefined,
  flags: SearchCommandFlags,
): Promise<SgrepResult> {
  return searchProject(patternInput, {
    cwd: flags.cwd,
    scope: scope ?? ".",
  });
}

export const searchCommand = buildCommand({
  async func(
    this: { process: { stdout: { write(s: string): void } } },
    flags: SearchCommandFlags,
    patternInput: string,
    scope?: string,
  ) {
    const result = await runSearchCommand(patternInput, scope, flags);
    this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  parameters: {
    flags: {
      cwd: {
        kind: "parsed" as const,
        optional: true,
        brief: "Working directory for resolving pattern file and scope",
        placeholder: "path",
        parse: (input: string) => input,
      },
    },
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "Pattern text or path to pattern file",
          placeholder: "pattern",
          parse: (input: string) => input,
        },
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
    brief: "Run structural search (sgrep-style) from a pattern",
  },
});
