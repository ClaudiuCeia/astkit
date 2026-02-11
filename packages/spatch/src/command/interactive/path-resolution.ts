import { stat } from "node:fs/promises";
import path from "node:path";

export async function resolveInteractiveFilePath(
  file: string,
  options: { cwd: string; scope: string; scopeKind: "file" | "directory" },
): Promise<string> {
  if (path.isAbsolute(file)) {
    const absolute = path.resolve(file);
    if (isCandidateInScope(absolute, options)) {
      return absolute;
    }
    throw new Error(`Resolved interactive file is outside selected scope: ${file}`);
  }

  const candidates = new Set<string>();
  if (options.scopeKind === "file") {
    candidates.add(options.scope);
    candidates.add(path.resolve(path.dirname(options.scope), file));
  } else {
    candidates.add(path.resolve(options.scope, file));
  }
  candidates.add(path.resolve(options.cwd, file));

  const resolvedCandidates: string[] = [];

  for (const candidate of candidates) {
    if (!isCandidateInScope(candidate, options)) {
      continue;
    }

    try {
      const candidateStats = await stat(candidate);
      if (candidateStats.isFile()) {
        resolvedCandidates.push(candidate);
      }
    } catch {
      // Try next candidate.
    }
  }

  if (resolvedCandidates.length === 1) {
    return resolvedCandidates[0]!;
  }
  if (resolvedCandidates.length > 1) {
    throw new Error(
      `Ambiguous interactive patch target file: ${file}. Re-run spatch interactive with a narrower scope.`,
    );
  }

  throw new Error(
    `Unable to resolve interactive patch target file: ${file}. Re-run spatch interactive.`,
  );
}

function isCandidateInScope(
  candidate: string,
  options: { scope: string; scopeKind: "file" | "directory" },
): boolean {
  if (options.scopeKind === "file") {
    return path.resolve(candidate) === options.scope;
  }

  const relative = path.relative(options.scope, candidate);
  if (relative.length === 0) {
    return true;
  }
  if (path.isAbsolute(relative)) {
    return false;
  }
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}
