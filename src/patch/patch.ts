import { buildCommand } from "@stricli/core";
import { patchProject } from "../spatch/spatch.ts";
import type { SpatchResult } from "../spatch/types.ts";

export type PatchCommandFlags = {
  "dry-run"?: boolean;
  cwd?: string;
};

export async function runPatchCommand(
  patchInput: string,
  scope: string | undefined,
  flags: PatchCommandFlags,
): Promise<SpatchResult> {
  return patchProject(patchInput, {
    cwd: flags.cwd,
    dryRun: flags["dry-run"] ?? false,
    scope: scope ?? ".",
  });
}

export const patchCommand = buildCommand({
  async func(
    this: { process: { stdout: { write(s: string): void } } },
    flags: PatchCommandFlags,
    patchInput: string,
    scope?: string,
  ) {
    const result = await runPatchCommand(patchInput, scope, flags);
    this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  parameters: {
    flags: {
      "dry-run": {
        kind: "boolean" as const,
        optional: true,
        brief: "Preview changes without writing files",
      },
      cwd: {
        kind: "parsed" as const,
        optional: true,
        brief: "Working directory for resolving patch file and scope",
        placeholder: "path",
        parse: (input: string) => input,
      },
    },
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "Patch document text or path to patch document file",
          placeholder: "patch",
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
    brief: "Apply structural rewrite from a patch document",
  },
});
