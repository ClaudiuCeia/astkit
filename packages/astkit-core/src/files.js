import { opendir, stat } from "node:fs/promises";
import path from "node:path";
export const DEFAULT_SOURCE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
];
export const DEFAULT_EXCLUDED_DIRECTORIES = [
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    "dist",
    "build",
    "coverage",
    "out",
];
export async function collectPatchableFiles(options) {
    const scopePath = path.resolve(options.cwd, options.scope);
    const scopeStats = await stat(scopePath);
    const extensionSet = new Set((options.extensions ?? DEFAULT_SOURCE_EXTENSIONS).map(normalizeExtension));
    const excludedDirectorySet = new Set(options.excludedDirectories ?? DEFAULT_EXCLUDED_DIRECTORIES);
    if (scopeStats.isFile()) {
        return extensionSet.has(path.extname(scopePath).toLowerCase())
            ? [scopePath]
            : [];
    }
    if (!scopeStats.isDirectory()) {
        return [];
    }
    const files = [];
    await walkDirectory(scopePath, extensionSet, excludedDirectorySet, files);
    return files;
}
async function walkDirectory(directory, extensions, excludedDirectories, files) {
    const directoryHandle = await opendir(directory);
    const entries = [];
    for await (const entry of directoryHandle) {
        entries.push(entry);
    }
    // Keep deterministic output without the overhead of locale-aware collation.
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
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
function normalizeExtension(extension) {
    const normalized = extension.trim().toLowerCase();
    if (normalized.startsWith(".")) {
        return normalized;
    }
    return `.${normalized}`;
}
