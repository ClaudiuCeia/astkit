import { readFile, realpath, stat } from "node:fs/promises";
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

  let inputStats: Awaited<ReturnType<typeof stat>>;
  try {
    inputStats = await stat(inputPath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return input;
    }
    throw error;
  }

  if (!inputStats.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }

  const repoRoot = await findNearestGitRepoRoot(cwd);
  const boundary = repoRoot ?? cwd;
  const canonicalBoundary = await resolveCanonicalPath(boundary);
  const canonicalInputPath = await resolveCanonicalPath(inputPath);
  if (!isPathWithinBase(canonicalBoundary, canonicalInputPath)) {
    if (repoRoot) {
      throw new Error(
        `Input path resolves outside repository root: input=${inputPath} repoRoot=${repoRoot}.`,
      );
    }
    throw new Error(`Input path resolves outside cwd: input=${inputPath} cwd=${cwd}.`);
  }

  return await readFile(inputPath, options.encoding ?? "utf8");
}

export async function parseTextInvocation<TSpec, TOptions extends ResolveTextInputOptions>(
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

async function findNearestGitRepoRoot(startDirectory: string): Promise<string | null> {
  let current = path.resolve(startDirectory);

  while (true) {
    try {
      await stat(path.join(current, ".git"));
      return current;
    } catch {
      // Move upward to find nearest git root.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function isRelativeWithinBase(relativePath: string): boolean {
  if (relativePath.length === 0) {
    return true;
  }

  if (path.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`);
}

function isPathWithinBase(basePath: string, candidatePath: string): boolean {
  const relativePath = path.relative(basePath, candidatePath);
  return isRelativeWithinBase(relativePath);
}

async function resolveCanonicalPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return path.resolve(filePath);
    }
    throw error;
  }
}
