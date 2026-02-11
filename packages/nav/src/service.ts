import { realpathSync, statSync } from "node:fs";
import ts from "typescript";
import path from "node:path";

export type WorkspaceBoundary = {
  cwd: string;
  repoRoot: string | null;
  canonicalBoundary: string;
};

export interface Service {
  service: ts.LanguageService;
  program: ts.Program;
  projectRoot: string;
}

export function createService(
  projectDir: string,
  targetFile?: string | readonly string[],
): Service {
  const cwd = path.resolve(projectDir);
  const boundary = createWorkspaceBoundary(cwd);
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists);
  const configPathWithinBoundary =
    typeof configPath === "string" && isPathWithinWorkspaceBoundary(boundary, configPath);

  let compilerOptions: ts.CompilerOptions;
  let fileNames: string[];
  let projectRoot: string;

  if (configPathWithinBoundary && configPath) {
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
    if (error) {
      throw new Error(
        `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`,
      );
    }
    projectRoot = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, projectRoot);
    compilerOptions = parsed.options;
    fileNames = parsed.fileNames
      .map((fileName) => path.resolve(projectRoot, fileName))
      .filter((fileName) => isPathWithinWorkspaceBoundary(boundary, fileName));
  } else {
    compilerOptions = ts.getDefaultCompilerOptions();
    fileNames = [];
    projectRoot = cwd;
  }

  // Ensure requested target files are in the language-service file set.
  const targetFiles = normalizeTargetFiles(targetFile);
  for (const requestedFile of targetFiles) {
    const resolved = path.resolve(cwd, requestedFile);
    assertPathWithinWorkspaceBoundary(boundary, resolved, "File path");
    if (!fileNames.includes(resolved)) {
      fileNames.push(resolved);
    }
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const content = ts.sys.readFile(file);
      if (content === undefined) return undefined;
      return ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  const service = ts.createLanguageService(host);
  const program = service.getProgram()!;

  return { service, program, projectRoot };
}

function normalizeTargetFiles(
  targetFile: string | readonly string[] | undefined,
): readonly string[] {
  if (targetFile === undefined) {
    return [];
  }

  if (typeof targetFile === "string") {
    return [targetFile];
  }

  return [...targetFile];
}

/** Convert 1-indexed line:character to 0-indexed offset */
export function toPosition(sourceFile: ts.SourceFile, line: number, character: number): number {
  return sourceFile.getPositionOfLineAndCharacter(line - 1, character - 1);
}

/** Convert 0-indexed offset to 1-indexed { line, character } */
export function fromPosition(
  sourceFile: ts.SourceFile,
  offset: number,
): { line: number; character: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(offset);
  return { line: lc.line + 1, character: lc.character + 1 };
}

/** Get relative path from project root */
export function relativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath);
}

export function assertPathWithinWorkspaceBoundary(
  boundaryOrCwd: WorkspaceBoundary | string,
  targetPath: string,
  label: string,
): void {
  const boundary =
    typeof boundaryOrCwd === "string" ? createWorkspaceBoundary(boundaryOrCwd) : boundaryOrCwd;
  const resolvedTarget = path.resolve(targetPath);
  const canonicalTarget = resolveCanonicalPath(resolvedTarget);
  if (isPathWithinBase(boundary.canonicalBoundary, canonicalTarget)) {
    return;
  }

  if (boundary.repoRoot) {
    throw new Error(
      `${label} resolves outside repository root: path=${resolvedTarget} repoRoot=${boundary.repoRoot}.`,
    );
  }
  throw new Error(`${label} resolves outside cwd: path=${resolvedTarget} cwd=${boundary.cwd}.`);
}

export function createWorkspaceBoundary(cwd: string): WorkspaceBoundary {
  const resolvedCwd = path.resolve(cwd);
  const repoRoot = findNearestGitRepoRoot(resolvedCwd);
  const boundary = repoRoot ?? resolvedCwd;
  return {
    cwd: resolvedCwd,
    repoRoot,
    canonicalBoundary: resolveCanonicalPath(boundary),
  };
}

export function isPathWithinWorkspaceBoundary(
  boundaryOrCwd: WorkspaceBoundary | string,
  targetPath: string,
): boolean {
  const boundary =
    typeof boundaryOrCwd === "string" ? createWorkspaceBoundary(boundaryOrCwd) : boundaryOrCwd;
  const canonicalTarget = resolveCanonicalPath(path.resolve(targetPath));
  return isPathWithinBase(boundary.canonicalBoundary, canonicalTarget);
}

function findNearestGitRepoRoot(startDirectory: string): string | null {
  let current = path.resolve(startDirectory);

  while (true) {
    try {
      statSync(path.join(current, ".git"));
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

function resolveCanonicalPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return path.resolve(filePath);
    }
    throw error;
  }
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
