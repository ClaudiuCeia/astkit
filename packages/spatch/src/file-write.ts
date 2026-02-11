import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type WriteFileIfUnchangedAtomicallyInput = {
  filePath: string;
  originalText: string;
  rewrittenText: string;
  encoding: BufferEncoding;
  operationName: string;
};

export async function writeFileIfUnchangedAtomically(
  input: WriteFileIfUnchangedAtomicallyInput,
): Promise<void> {
  let currentText: string;
  try {
    currentText = await readFile(input.filePath, input.encoding);
  } catch {
    throw buildStaleApplyError(input.filePath, input.operationName);
  }
  if (currentText !== input.originalText) {
    throw buildStaleApplyError(input.filePath, input.operationName);
  }

  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(input.filePath);
  } catch {
    throw buildStaleApplyError(input.filePath, input.operationName);
  }

  const tempPath = buildAtomicTempPath(input.filePath);
  await writeFile(tempPath, input.rewrittenText, {
    encoding: input.encoding,
    mode: fileStats.mode,
  });

  try {
    await rename(tempPath, input.filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
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
