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

export type FileWriteFs = {
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

export type TransactionEntry = {
  filePath: string;
  originalText: string;
  rewrittenText: string;
  encoding: BufferEncoding;
  operationName: string;
};

export class PartialCommitError extends Error {
  readonly affectedFiles: readonly string[];

  constructor(affectedFiles: string[]) {
    const sorted = [...affectedFiles].sort();
    super(
      `Partial commit: rollback failed for ${sorted.length} file(s). Manual inspection required: ${sorted.join(", ")}`,
    );
    this.name = "PartialCommitError";
    this.affectedFiles = sorted;
  }
}

const defaultFs: FileWriteFs = {
  readFile,
  stat,
  writeFile,
  rename,
  rm,
};

/**
 * Commits a set of staged file replacements transactionally.
 *
 * - Preflights all targets against their analyzed source content before touching
 *   any file. If any file has changed since analysis, no writes are performed.
 * - Commits in deterministic absolute-path order with a final stale-content
 *   check before each rename.
 * - On commit failure, rolls back committed files in reverse order without
 *   overwriting concurrent external edits.
 * - Throws `PartialCommitError` (listing affected absolute paths) if rollback
 *   cannot fully restore the original state.
 */
export async function commitTransaction(
  entries: TransactionEntry[],
  options?: { fs?: FileWriteFs },
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const fs = options?.fs ?? defaultFs;

  // Sort by absolute path for deterministic, reproducible commit order.
  const sorted = [...entries].sort((a, b) => a.filePath.localeCompare(b.filePath));

  // Preflight: verify all files still match their analyzed content before
  // touching any target. Any mismatch aborts the entire transaction.
  for (const entry of sorted) {
    let current: string;
    try {
      current = await fs.readFile(entry.filePath, entry.encoding);
    } catch (error) {
      throw mapReadError(error, entry.filePath, entry.operationName);
    }
    if (current !== entry.originalText) {
      throw buildStaleApplyError(entry.filePath, entry.operationName);
    }
  }

  // Commit phase: write each file in sorted order.
  const committed: TransactionEntry[] = [];
  let commitError: unknown = null;

  for (const entry of sorted) {
    try {
      await writeFileIfUnchangedAtomically({ ...entry, fs });
      committed.push(entry);
    } catch (error) {
      commitError = error;
      break;
    }
  }

  if (commitError === null) {
    return; // All files committed successfully.
  }

  // Rollback: restore committed files in reverse order.
  // Concurrent external edits are preserved rather than overwritten.
  const rollbackFailures: string[] = [];

  for (const entry of [...committed].reverse()) {
    try {
      let current: string;
      try {
        current = await fs.readFile(entry.filePath, entry.encoding);
      } catch {
        // File is unreadable (e.g. deleted) after our commit — cannot restore.
        rollbackFailures.push(entry.filePath);
        continue;
      }

      if (current !== entry.rewrittenText) {
        // File was concurrently edited after our commit — preserve it.
        rollbackFailures.push(entry.filePath);
        continue;
      }

      await writeFileIfUnchangedAtomically({
        filePath: entry.filePath,
        originalText: entry.rewrittenText,
        rewrittenText: entry.originalText,
        encoding: entry.encoding,
        operationName: `${entry.operationName} rollback`,
        fs,
      });
    } catch {
      rollbackFailures.push(entry.filePath);
    }
  }

  if (rollbackFailures.length > 0) {
    throw new PartialCommitError(rollbackFailures);
  }

  throw commitError;
}

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
