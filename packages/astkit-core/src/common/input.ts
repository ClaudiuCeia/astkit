import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type ResolveTextInputOptions = {
  cwd?: string;
  encoding?: BufferEncoding;
};

export type ResolvedTextInvocation<TSpec, TOptions extends ResolveTextInputOptions> = {
  spec: TSpec;
  options: TOptions;
};

export async function resolveTextInput(
  input: string,
  options: ResolveTextInputOptions = {},
): Promise<string> {
  if (input.includes("\n") || input.includes("\r")) {
    return input;
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const inputPath = path.resolve(cwd, input);

  try {
    const inputStats = await stat(inputPath);
    if (!inputStats.isFile()) {
      throw new Error(`Input path is not a file: ${inputPath}`);
    }

    return await readFile(inputPath, options.encoding ?? "utf8");
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return input;
    }
    throw error;
  }
}

export async function parseTextInvocation<
  TSpec,
  TOptions extends ResolveTextInputOptions,
>(
  input: string,
  options: TOptions,
  parseSpec: (text: string) => TSpec,
): Promise<ResolvedTextInvocation<TSpec, TOptions>> {
  const text = await resolveTextInput(input, options);
  return {
    spec: parseSpec(text),
    options,
  };
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
