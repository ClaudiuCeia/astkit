import path from "node:path";
import ts from "typescript";
import {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_SOURCE_EXTENSIONS,
  collectPatchableFiles,
} from "@claudiu-ceia/astkit-core";
import {
  assertPathWithinWorkspaceBoundary,
  createService,
  createWorkspaceBoundary,
  fromPosition,
  isPathWithinWorkspaceBoundary,
  relativePath,
} from "../service.ts";

export type CodeRankOptions = {
  cwd?: string;
  scope?: string;
  limit?: number;
  extensions?: readonly string[];
  excludedDirectories?: readonly string[];
};

export type RankedSymbol = {
  symbol: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  score: number;
  referenceCount: number;
  internalReferenceCount: number;
  externalReferenceCount: number;
  referencingFileCount: number;
  referencingFiles: string[];
};

export type CodeRankResult = {
  cwd: string;
  scope: string;
  filesScanned: number;
  symbolsScanned: number;
  symbolsRanked: number;
  symbols: RankedSymbol[];
};

export async function rankCode(options: CodeRankOptions = {}): Promise<CodeRankResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const boundary = createWorkspaceBoundary(cwd);
  const scope = options.scope ?? ".";
  const resolvedScope = path.resolve(cwd, scope);
  assertPathWithinWorkspaceBoundary(boundary, resolvedScope, "Scope");
  const files = await collectPatchableFiles({
    cwd,
    scope,
    extensions: options.extensions ?? DEFAULT_SOURCE_EXTENSIONS,
    excludedDirectories: options.excludedDirectories ?? DEFAULT_EXCLUDED_DIRECTORIES,
  });

  if (files.length === 0) {
    return {
      cwd,
      scope: resolvedScope,
      filesScanned: 0,
      symbolsScanned: 0,
      symbolsRanked: 0,
      symbols: [],
    };
  }

  const { service, program, projectRoot } = createService(cwd, files);
  const checker = program.getTypeChecker();
  const symbols: RankedSymbol[] = [];
  const seenDeclarations = new Set<string>();

  for (const filePath of files) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      continue;
    }

    const exportedSymbols = checker.getExportsOfModule(moduleSymbol);
    for (const exportedSymbol of exportedSymbols) {
      const declaration = pickDeclarationInFile(exportedSymbol, filePath);
      if (!declaration) {
        continue;
      }

      const declarationSourceFile = declaration.getSourceFile();
      const declarationStart = declaration.getStart(declarationSourceFile);
      const declarationKey = `${declarationSourceFile.fileName}:${declarationStart}:${exportedSymbol.getName()}`;
      if (seenDeclarations.has(declarationKey)) {
        continue;
      }
      seenDeclarations.add(declarationKey);

      const stats = collectReferenceStats(
        service.findReferences(declarationSourceFile.fileName, declarationStart),
        declarationSourceFile.fileName,
        projectRoot,
        boundary,
      );
      const pos = fromPosition(declarationSourceFile, declarationStart);
      symbols.push({
        symbol: exportedSymbol.getName(),
        kind: getDeclarationKind(declaration),
        file:
          relativePath(projectRoot, declarationSourceFile.fileName) ||
          path.basename(declarationSourceFile.fileName),
        line: pos.line,
        character: pos.character,
        score: computeRankScore(stats),
        referenceCount: stats.referenceCount,
        internalReferenceCount: stats.internalReferenceCount,
        externalReferenceCount: stats.externalReferenceCount,
        referencingFileCount: stats.referencingFiles.length,
        referencingFiles: stats.referencingFiles,
      });
    }
  }

  symbols.sort(compareRankedSymbols);
  const limit = normalizeLimit(options.limit);
  const rankedSymbols = limit === null ? symbols : symbols.slice(0, limit);

  return {
    cwd,
    scope: resolvedScope,
    filesScanned: files.length,
    symbolsScanned: symbols.length,
    symbolsRanked: rankedSymbols.length,
    symbols: rankedSymbols,
  };
}

type ReferenceStats = {
  referenceCount: number;
  internalReferenceCount: number;
  externalReferenceCount: number;
  referencingFiles: string[];
};

function collectReferenceStats(
  references: readonly ts.ReferencedSymbol[] | undefined,
  declarationFile: string,
  projectRoot: string,
  boundary: ReturnType<typeof createWorkspaceBoundary>,
): ReferenceStats {
  if (!references || references.length === 0) {
    return {
      referenceCount: 0,
      internalReferenceCount: 0,
      externalReferenceCount: 0,
      referencingFiles: [],
    };
  }

  const seenReferences = new Set<string>();
  const referencingFiles = new Set<string>();
  const normalizedDeclarationFile = path.resolve(declarationFile);
  let referenceCount = 0;
  let internalReferenceCount = 0;
  let externalReferenceCount = 0;

  for (const group of references) {
    for (const reference of group.references) {
      const key = `${reference.fileName}:${reference.textSpan.start}:${reference.textSpan.length}`;
      if (seenReferences.has(key)) {
        continue;
      }
      seenReferences.add(key);
      if (!isPathWithinWorkspaceBoundary(boundary, reference.fileName)) {
        continue;
      }

      if (reference.isDefinition) {
        continue;
      }

      referenceCount += 1;
      const normalizedReferenceFile = path.resolve(reference.fileName);
      if (normalizedReferenceFile === normalizedDeclarationFile) {
        internalReferenceCount += 1;
      } else {
        externalReferenceCount += 1;
      }

      referencingFiles.add(
        relativePath(projectRoot, reference.fileName) || path.basename(reference.fileName),
      );
    }
  }

  return {
    referenceCount,
    internalReferenceCount,
    externalReferenceCount,
    referencingFiles: [...referencingFiles].sort((left, right) => left.localeCompare(right)),
  };
}

function computeRankScore(stats: ReferenceStats): number {
  return (
    stats.externalReferenceCount * 4 + stats.referenceCount + stats.referencingFiles.length * 2
  );
}

function compareRankedSymbols(left: RankedSymbol, right: RankedSymbol): number {
  return (
    right.score - left.score ||
    right.externalReferenceCount - left.externalReferenceCount ||
    right.referenceCount - left.referenceCount ||
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.symbol.localeCompare(right.symbol)
  );
}

function pickDeclarationInFile(symbol: ts.Symbol, filePath: string): ts.Declaration | null {
  const normalizedFilePath = path.resolve(filePath);
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) {
    return null;
  }

  for (const declaration of declarations) {
    const declarationFile = path.resolve(declaration.getSourceFile().fileName);
    if (declarationFile === normalizedFilePath && isRankableDeclaration(declaration)) {
      return declaration;
    }
  }

  return null;
}

function getDeclarationKind(declaration: ts.Declaration): string {
  if (ts.isFunctionDeclaration(declaration)) return "function";
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isVariableDeclaration(declaration)) return "const";
  if (ts.isModuleDeclaration(declaration)) return "module";

  return "unknown";
}

function isRankableDeclaration(declaration: ts.Declaration): boolean {
  return (
    ts.isFunctionDeclaration(declaration) ||
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration) ||
    ts.isVariableDeclaration(declaration) ||
    ts.isModuleDeclaration(declaration)
  );
}

function normalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) {
    return null;
  }

  return Math.max(0, Math.floor(limit));
}
