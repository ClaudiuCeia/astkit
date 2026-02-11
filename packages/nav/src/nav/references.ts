import path from "node:path";
import { buildCommand } from "@stricli/core";
import { parseFilePosition, type FilePosition } from "./location.ts";
import {
  assertPathWithinWorkspaceBoundary,
  createWorkspaceBoundary,
  createService,
  isPathWithinWorkspaceBoundary,
  toPosition,
  fromPosition,
  relativePath,
} from "../service.ts";

interface ReferenceLocation {
  file: string;
  line: number;
  character: number;
  isDefinition: boolean;
  isWriteAccess: boolean;
}

interface ReferencesOutput {
  symbol: string;
  definition: { file: string; line: number; character: number } | null;
  references: ReferenceLocation[];
}

export function getReferences(filePath: string, line: number, character: number): ReferencesOutput {
  const cwd = path.resolve(process.cwd());
  const boundary = createWorkspaceBoundary(cwd);
  const resolved = path.resolve(cwd, filePath);
  assertPathWithinWorkspaceBoundary(boundary, resolved, "File path");
  const { service, program, projectRoot } = createService(cwd, resolved);

  const sourceFile = program.getSourceFile(resolved);
  if (!sourceFile) {
    throw new Error(`File not found: ${filePath}`);
  }

  const pos = toPosition(sourceFile, line, character);
  const refSymbols = service.findReferences(resolved, pos);

  if (!refSymbols || refSymbols.length === 0) {
    const wordRange = service.getSmartSelectionRange(resolved, pos);
    const symbolName = wordRange
      ? sourceFile.text.slice(
          wordRange.textSpan.start,
          wordRange.textSpan.start + wordRange.textSpan.length,
        )
      : "<unknown>";
    return { symbol: symbolName, definition: null, references: [] };
  }

  const firstGroup = refSymbols[0]!;
  const symbol = firstGroup.definition.name || "<unknown>";

  // Extract definition location
  const defSpan = firstGroup.definition.textSpan;
  const defFile = firstGroup.definition.fileName;
  const defSourceFile = program.getSourceFile(defFile);
  let definition: ReferencesOutput["definition"] = null;
  if (defSourceFile && isPathWithinWorkspaceBoundary(boundary, defFile)) {
    const defPos = fromPosition(defSourceFile, defSpan.start);
    definition = {
      file: relativePath(projectRoot, defFile),
      line: defPos.line,
      character: defPos.character,
    };
  }

  // Extract all references
  const references: ReferenceLocation[] = [];
  for (const group of refSymbols) {
    for (const ref of group.references) {
      const refSourceFile = program.getSourceFile(ref.fileName);
      if (!refSourceFile || !isPathWithinWorkspaceBoundary(boundary, ref.fileName)) continue;

      const refPos = fromPosition(refSourceFile, ref.textSpan.start);
      references.push({
        file: relativePath(projectRoot, ref.fileName),
        line: refPos.line,
        character: refPos.character,
        isDefinition: ref.isDefinition ?? false,
        isWriteAccess: ref.isWriteAccess ?? false,
      });
    }
  }

  return { symbol, definition, references: dedupeReferenceLocations(references) };
}

export function dedupeReferenceLocations(
  references: readonly ReferenceLocation[],
): ReferenceLocation[] {
  const bySpan = new Map<string, ReferenceLocation>();

  for (const reference of references) {
    const key = `${reference.file}:${reference.line}:${reference.character}`;
    const existing = bySpan.get(key);
    if (!existing) {
      bySpan.set(key, { ...reference });
      continue;
    }

    existing.isDefinition ||= reference.isDefinition;
    existing.isWriteAccess ||= reference.isWriteAccess;
  }

  return [...bySpan.values()];
}

export const referencesCommand = buildCommand<{}, [FilePosition]>({
  func(
    this: { process: { stdout: { write(s: string): void } } },
    _flags: {},
    location: FilePosition,
  ) {
    const result = getReferences(location.file, location.line, location.character);
    this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  parameters: {
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "Location (<file>:<line>:<character>)",
          placeholder: "location",
          parse: parseFilePosition,
        },
      ],
    },
  },
  docs: {
    brief: "Find all references at position",
  },
});
