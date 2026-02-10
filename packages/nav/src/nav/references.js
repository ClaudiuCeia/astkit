import path from "node:path";
import { buildCommand } from "@stricli/core";
import { parseFilePosition } from "./location.js";
import { createService, toPosition, fromPosition, relativePath } from "../service.js";
export function getReferences(filePath, line, character) {
    const resolved = path.resolve(filePath);
    const { service, program, projectRoot } = createService(process.cwd(), resolved);
    const sourceFile = program.getSourceFile(resolved);
    if (!sourceFile) {
        throw new Error(`File not found: ${filePath}`);
    }
    const pos = toPosition(sourceFile, line, character);
    const refSymbols = service.findReferences(resolved, pos);
    if (!refSymbols || refSymbols.length === 0) {
        const wordRange = service.getSmartSelectionRange(resolved, pos);
        const symbolName = wordRange
            ? sourceFile.text.slice(wordRange.textSpan.start, wordRange.textSpan.start + wordRange.textSpan.length)
            : "<unknown>";
        return { symbol: symbolName, definition: null, references: [] };
    }
    const firstGroup = refSymbols[0];
    const symbol = firstGroup.definition.name || "<unknown>";
    // Extract definition location
    const defSpan = firstGroup.definition.textSpan;
    const defFile = firstGroup.definition.fileName;
    const defSourceFile = program.getSourceFile(defFile);
    let definition = null;
    if (defSourceFile) {
        const defPos = fromPosition(defSourceFile, defSpan.start);
        definition = {
            file: relativePath(projectRoot, defFile),
            line: defPos.line,
            character: defPos.character,
        };
    }
    // Extract all references
    const references = [];
    for (const group of refSymbols) {
        for (const ref of group.references) {
            const refSourceFile = program.getSourceFile(ref.fileName);
            if (!refSourceFile)
                continue;
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
    return { symbol, definition, references };
}
export const referencesCommand = buildCommand({
    func(_flags, location) {
        const result = getReferences(location.file, location.line, location.character);
        this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    },
    parameters: {
        positional: {
            kind: "tuple",
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
