import { stderr as processStderr, stdin as processStdin } from "node:process";
import { buildCommand } from "@stricli/core";
import { resolveTextInput } from "@claudiu-ceia/astkit-core";
import {
  patchCommandFlagParameters,
  validatePatchCommandFlags,
  type PatchCommandFlags,
} from "./command/flags.ts";
import { runInteractivePatchCommand } from "./command/interactive.ts";
import type { InteractiveDecider } from "./command/interactive/types.ts";
import { formatPatchOutput } from "./command/output.ts";
import { patchProject } from "./spatch.ts";
import type { SpatchOptions, SpatchResult } from "./types.ts";

type RunPatchCommandOptions = {
  interactiveDecider?: InteractiveDecider;
  /**
   * Text encoding used for reading/writing scoped source files.
   * Defaults to "utf8".
   */
  encoding?: BufferEncoding;
  /**
   * Optional logger override. Defaults to stderr when --verbose is enabled.
   */
  logger?: (line: string) => void;
  /**
   * Used for testing / embedding. If omitted and patch input is "-", stdin will
   * be read from the current process.
   */
  readStdin?: () => Promise<string>;
  /**
   * Optional stream source for stdin patch input. Ignored when `readStdin` is
   * provided. Defaults to process stdin.
   */
  stdinStream?: ReadableTextStream;
};

type ReadableTextStream = AsyncIterable<unknown> & {
  setEncoding?(encoding: BufferEncoding): void;
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
  const logger =
    options.logger ??
    (flags.verbose ? (line: string) => processStderr.write(`${line}\n`) : undefined);
  const resolvedPatchInput = await resolvePatchInput(patchInput, {
    cwd: patchCwd,
    encoding: "utf8",
    readStdin: options.readStdin,
    stdinStream: options.stdinStream,
  });
  const patchOptions: SpatchOptions = {
    concurrency: flags.concurrency,
    cwd: patchCwd,
    encoding: options.encoding,
    logger,
    scope: patchScope,
    verbose: flags.verbose,
  };

  if (flags.interactive ?? false) {
    return runInteractivePatchCommand(resolvedPatchInput, {
      ...patchOptions,
      noColor: flags["no-color"] ?? false,
      interactiveDecider: options.interactiveDecider,
    });
  }

  return patchProject(resolvedPatchInput, {
    ...patchOptions,
    dryRun: (flags["dry-run"] ?? false) || (flags.check ?? false),
  });
}

export const patchCommand = buildCommand({
  async func(
    this: { process: { stdout: { write(s: string): void; isTTY?: boolean } } },
    flags: PatchCommandFlags,
    patchInput: string,
    scope?: string,
  ) {
    const result = await runPatchCommand(patchInput, scope, flags);
    if (flags.json ?? false) {
      this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      enforceCheckMode(flags, result);
      return;
    }

    const output = formatPatchOutput(result, {
      color: Boolean(this.process.stdout.isTTY) && !(flags["no-color"] ?? false),
    });
    this.process.stdout.write(`${output}\n`);

    enforceCheckMode(flags, result);
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

function enforceCheckMode(flags: PatchCommandFlags, result: SpatchResult): void {
  if (!(flags.check ?? false)) {
    return;
  }

  if (result.totalReplacements > 0) {
    throw new Error(
      `Check failed: ${result.totalReplacements} replacements would be applied in ${result.filesChanged} files.`,
    );
  }
}

async function resolvePatchInput(
  patchInput: string,
  options: {
    cwd: string | undefined;
    encoding: BufferEncoding;
    readStdin?: () => Promise<string>;
    stdinStream?: ReadableTextStream;
  },
): Promise<string> {
  if (patchInput !== "-") {
    return await resolveTextInput(patchInput, { cwd: options.cwd, encoding: options.encoding });
  }

  const reader =
    options.readStdin ??
    (() => readAllFromStream(options.stdinStream ?? processStdin, options.encoding));
  const text = await reader();
  if (text.length === 0) {
    throw new Error("Patch document read from stdin was empty.");
  }
  return text;
}

async function readAllFromStream(
  stream: ReadableTextStream,
  encoding: BufferEncoding,
): Promise<string> {
  stream.setEncoding?.(encoding);

  let text = "";
  for await (const chunk of stream) {
    text += String(chunk);
  }
  return text;
}
