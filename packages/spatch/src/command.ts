import {
  stderr as processStderr,
  stdin as processStdin,
  stdout as processStdout,
} from "node:process";
import { buildCommand } from "@stricli/core";
import { resolveTextInput } from "@claudiu-ceia/astkit-core";
import {
  patchCommandFlagParameters,
  validatePatchCommandFlags,
  type PatchCommandFlags,
} from "./command/flags.ts";
import {
  runInteractivePatchCommand,
  type InteractiveDecider,
} from "./command/interactive.ts";
import { formatPatchOutput } from "./command/output.ts";
import { patchProject } from "./spatch.ts";
import type { SpatchOptions, SpatchResult } from "./types.ts";

export type RunPatchCommandOptions = {
  interactiveDecider?: InteractiveDecider;
  /**
   * Optional logger override. Defaults to stderr when --verbose is enabled.
   */
  logger?: (line: string) => void;
  /**
   * Used for testing / embedding. If omitted and patch input is "-", stdin will
   * be read from the current process.
   */
  readStdin?: () => Promise<string>;
};

export async function runPatchCommand(
  patchInput: string,
  scope: string | undefined,
  flags: PatchCommandFlags,
  options: RunPatchCommandOptions = {},
): Promise<SpatchResult> {
  validatePatchCommandFlags(flags);

  const patchScope = scope ?? ".";
  const patchCwd = flags.cwd;
  const logger = options.logger ??
    (flags.verbose ? (line: string) => processStderr.write(`${line}\n`) : undefined);
  const resolvedPatchInput = await resolvePatchInput(
    patchInput,
    {
      cwd: patchCwd,
      encoding: "utf8",
      readStdin: options.readStdin,
    },
  );
  const patchOptions: SpatchOptions = {
    concurrency: flags.concurrency,
    cwd: patchCwd,
    logger,
    scope: patchScope,
    verbose: flags.verbose,
  };

  if (flags.interactive ?? false) {
    return runInteractivePatchCommand(
      resolvedPatchInput,
      {
        ...patchOptions,
        noColor: flags["no-color"] ?? false,
        interactiveDecider: options.interactiveDecider,
      },
    );
  }

  return patchProject(resolvedPatchInput, {
    ...patchOptions,
    dryRun: flags["dry-run"] ?? false,
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
    if (flags.json ?? false) {
      this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    const output = formatPatchOutput(result, {
      color: Boolean(processStdout.isTTY) && !(flags["no-color"] ?? false),
    });
    this.process.stdout.write(`${output}\n`);
  },
  parameters: {
    flags: patchCommandFlagParameters,
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

async function resolvePatchInput(
  patchInput: string,
  options: { cwd: string | undefined; encoding: BufferEncoding; readStdin?: () => Promise<string> },
): Promise<string> {
  if (patchInput !== "-") {
    return await resolveTextInput(patchInput, { cwd: options.cwd, encoding: options.encoding });
  }

  const reader = options.readStdin ?? (() => readAllFromStdin(options.encoding));
  const text = await reader();
  if (text.length === 0) {
    throw new Error("Patch document read from stdin was empty.");
  }
  return text;
}

async function readAllFromStdin(encoding: BufferEncoding): Promise<string> {
  // Read raw patch document from stdin (e.g. `cat rule.spatch | spatch - src`).
  // `node:process` stdin is a stream in both Node and Bun.
  const stdin = processStdin;
  stdin.setEncoding(encoding);

  let text = "";
  for await (const chunk of stdin) {
    text += String(chunk);
  }
  return text;
}

export { validatePatchCommandFlags } from "./command/flags.ts";
export { formatPatchOutput } from "./command/output.ts";
export type { PatchCommandFlags } from "./command/flags.ts";
export type { InteractiveContext } from "./command/interactive.ts";
