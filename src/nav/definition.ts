import path from "node:path";
import { buildCommand, numberParser } from "@stricli/core";
import { createService, toPosition, fromPosition, relativePath } from "../service.ts";

interface DefinitionLocation {
  file: string;
  line: number;
  character: number;
  kind: string;
  containerName: string;
}

interface DefinitionOutput {
  symbol: string;
  definitions: DefinitionLocation[];
}

export function getDefinition(filePath: string, line: number, character: number): DefinitionOutput {
  const resolved = path.resolve(filePath);
  const { service, program, projectRoot } = createService(process.cwd(), resolved);

  const sourceFile = program.getSourceFile(resolved);
  if (!sourceFile) {
    throw new Error(`File not found: ${filePath}`);
  }

  const pos = toPosition(sourceFile, line, character);
  const defs = service.getDefinitionAtPosition(resolved, pos);

  if (!defs || defs.length === 0) {
    // Get the word at position for the symbol name
    const wordRange = service.getSmartSelectionRange(resolved, pos);
    const symbolName = wordRange
      ? sourceFile.text.slice(wordRange.textSpan.start, wordRange.textSpan.start + wordRange.textSpan.length)
      : "<unknown>";
    return { symbol: symbolName, definitions: [] };
  }

  const symbol = defs[0]!.name || "<unknown>";
  const definitions: DefinitionLocation[] = defs.map((def) => {
    const defSourceFile = program.getSourceFile(def.fileName);
    let defLine = 1;
    let defChar = 1;
    if (defSourceFile) {
      const lc = fromPosition(defSourceFile, def.textSpan.start);
      defLine = lc.line;
      defChar = lc.character;
    }
    return {
      file: relativePath(projectRoot, def.fileName),
      line: defLine,
      character: defChar,
      kind: def.kind,
      containerName: def.containerName || "",
    };
  });

  return { symbol, definitions };
}

export const definitionCommand = buildCommand({
  func(this: { process: { stdout: { write(s: string): void } } }, _flags, file: string, line: number, character: number) {
    const result = getDefinition(file, line, character);
    this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  parameters: {
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "Source file",
          placeholder: "file",
          parse: (input: string) => input,
        },
        {
          brief: "Line number (1-indexed)",
          placeholder: "line",
          parse: numberParser,
        },
        {
          brief: "Character position (1-indexed)",
          placeholder: "character",
          parse: numberParser,
        },
      ],
    },
  },
  docs: {
    brief: "Go to definition at position",
  },
});
