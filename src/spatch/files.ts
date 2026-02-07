import { opendir, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_PATCHABLE_EXTENSIONS,
} from "./types.ts";

export type CollectPatchableFilesOptions = {
  cwd: string;
  scope: string;
  extensions?: readonly string[];
  excludedDirectories?: readonly string[];
};

export async function collectPatchableFiles(
  options: CollectPatchableFilesOptions,
): Promise<string[]> {
  const scopePath = path.resolve(options.cwd, options.scope);
  const scopeStats = await stat(scopePath);
  const extensionSet = new Set(
    (options.extensions ?? DEFAULT_PATCHABLE_EXTENSIONS).map(normalizeExtension),
  );
  const excludedDirectorySet = new Set(
    options.excludedDirectories ?? DEFAULT_EXCLUDED_DIRECTORIES,
  );

  if (scopeStats.isFile()) {
    return extensionSet.has(path.extname(scopePath).toLowerCase())
      ? [scopePath]
      : [];
  }

  if (!scopeStats.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  await walkDirectory(scopePath, extensionSet, excludedDirectorySet, files);
  return files;
}

async function walkDirectory(
  directory: string,
  extensions: ReadonlySet<string>,
  excludedDirectories: ReadonlySet<string>,
  files: string[],
): Promise<void> {
  const directoryHandle = await opendir(directory);
  const entries = [];
  for await (const entry of directoryHandle) {
    entries.push(entry);
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) {
        continue;
      }
      await walkDirectory(absolute, extensions, excludedDirectories, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolute);
    }
  }
}

function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();
  if (normalized.startsWith(".")) {
    return normalized;
  }

  return `.${normalized}`;
}
