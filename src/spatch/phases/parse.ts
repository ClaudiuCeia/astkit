import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parsePatchDocument } from "../patch-document.ts";
import type { SpatchOptions } from "../types.ts";

export type ParsedPatchSpec = {
  pattern: string;
  replacement: string;
};

export type ParsedPatchInvocation = {
  patch: ParsedPatchSpec;
  options: SpatchOptions;
};

export function parsePatchSpec(patchDocument: string): ParsedPatchSpec {
  const parsed = parsePatchDocument(patchDocument);
  return {
    pattern: parsed.pattern,
    replacement: parsed.replacement,
  };
}

export async function parsePatchInvocation(
  patchInput: string,
  options: SpatchOptions = {},
): Promise<ParsedPatchInvocation> {
  const patchDocument = await resolvePatchDocument(patchInput, options);

  return {
    patch: parsePatchSpec(patchDocument),
    options,
  };
}

async function resolvePatchDocument(
  patchInput: string,
  options: SpatchOptions,
): Promise<string> {
  if (patchInput.includes("\n") || patchInput.includes("\r")) {
    return patchInput;
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const patchPath = path.resolve(cwd, patchInput);

  try {
    const patchStats = await stat(patchPath);
    if (!patchStats.isFile()) {
      throw new Error(`Patch path is not a file: ${patchPath}`);
    }

    return await readFile(patchPath, options.encoding ?? "utf8");
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return patchInput;
    }
    throw error;
  }
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
