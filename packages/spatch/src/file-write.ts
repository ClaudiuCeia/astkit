import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type WriteFileIfUnchangedAtomicallyInput = {
  filePath: string;
  originalText: string;
  rewrittenText: string;
  encoding: BufferEncoding;
  operationName: string;
  fs?: FileWriteFs;
};

type FileWriteFs = {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  stat: (path: string) => Promise<{ mode: number }>;
  writeFile: (
    path: string,
    data: string,
    options: { encoding: BufferEncoding; mode: number },
  ) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options: { force: boolean }) => Promise<void>;
};

const defaultFs: FileWriteFs = {
  readFile,
  stat,
  writeFile,
  rename,
  rm,
};

export async function writeFileIfUnchangedAtomically(
  input: WriteFileIfUnchangedAtomicallyInput,
): Promise<void> {
  const fs = input.fs ?? defaultFs;

  let currentText: string;
  try {
    currentText = await fs.readFile(input.filePath, input.encoding);
  } catch (error) {
    throw mapReadError(error, input.filePath, input.operationName);
  }
  if (currentText !== input.originalText) {
    throw buildStaleApplyError(input.filePath, input.operationName);
  }

  let fileStats: { mode: number };
  try {
    fileStats = await fs.stat(input.filePath);
  } catch (error) {
    throw mapReadError(error, input.filePath, input.operationName);
  }

  const tempPath = buildAtomicTempPath(input.filePath);
  try {
    await fs.writeFile(tempPath, input.rewrittenText, {
      encoding: input.encoding,
      mode: fileStats.mode,
    });
    let latestText: string;
    try {
      latestText = await fs.readFile(input.filePath, input.encoding);
    } catch (error) {
      throw mapReadError(error, input.filePath, input.operationName);
    }
    if (latestText !== input.originalText) {
      throw buildStaleApplyError(input.filePath, input.operationName);
    }
    await fs.rename(tempPath, input.filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function mapReadError(error: unknown, filePath: string, operationName: string): unknown {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return buildStaleApplyError(filePath, operationName);
  }
  return error;
}

function buildAtomicTempPath(filePath: string): string {
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);
  return path.join(directory, `.${fileName}.spatch-${process.pid}-${randomUUID()}.tmp`);
}

function buildStaleApplyError(filePath: string, operationName: string): Error {
  return new Error(
    `File changed during ${operationName}: ${filePath}. Re-run spatch to avoid overwriting concurrent edits.`,
  );
}
