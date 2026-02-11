import {
  any,
  eof,
  formatErrorCompact,
  many,
  map,
  optional,
  regex as parseRegex,
  seq,
  str,
} from "@claudiu-ceia/combine";

export type ParsedPatchDocument = {
  pattern: string;
  replacement: string;
  additions: number;
  deletions: number;
  contextLines: number;
  trailingNewline: boolean;
};

type ParsedPatchLine =
  | { kind: "context"; value: string }
  | { kind: "addition"; value: string }
  | { kind: "deletion"; value: string };

const lineContentParser = parseRegex(/[^\n]*/, "line content");

const escapedMarkerLineParser = map(
  seq(str("\\"), any(str("+"), str("-")), lineContentParser),
  ([, marker, content]) =>
    ({
      kind: "context",
      value: `${marker}${content}`,
    }) satisfies ParsedPatchLine,
);

const additionLineParser = map(
  seq(str("+"), lineContentParser),
  ([, content]) => ({ kind: "addition", value: content }) satisfies ParsedPatchLine,
);

const deletionLineParser = map(
  seq(str("-"), lineContentParser),
  ([, content]) => ({ kind: "deletion", value: content }) satisfies ParsedPatchLine,
);

const contextLineParser = map(
  lineContentParser,
  (content) => ({ kind: "context", value: content }) satisfies ParsedPatchLine,
);

const patchLineParser = any(
  escapedMarkerLineParser,
  additionLineParser,
  deletionLineParser,
  contextLineParser,
);

const patchDocumentParser = map(
  seq(
    patchLineParser,
    many(map(seq(str("\n"), patchLineParser), ([, line]) => line)),
    optional(str("\n")),
    eof(),
  ),
  ([firstLine, remainingLines, trailingNewline]) => ({
    lines: [firstLine, ...remainingLines],
    trailingNewline: trailingNewline !== null,
  }),
);

export function parsePatchDocument(source: string): ParsedPatchDocument {
  if (source.length === 0) {
    throw new Error("Patch document cannot be empty.");
  }

  const normalized = source.replaceAll("\r\n", "\n");
  const trailingNewline = normalized.endsWith("\n");
  const parsed = patchDocumentParser({ text: normalized, index: 0 });
  if (!parsed.success) {
    throw new Error(`Invalid patch document: ${formatErrorCompact(parsed)}`);
  }

  const lines =
    trailingNewline &&
    parsed.value.lines.length > 0 &&
    parsed.value.lines[parsed.value.lines.length - 1]?.kind === "context" &&
    parsed.value.lines[parsed.value.lines.length - 1]?.value === ""
      ? parsed.value.lines.slice(0, -1)
      : parsed.value.lines;

  const patternLines: string[] = [];
  const replacementLines: string[] = [];
  let additions = 0;
  let deletions = 0;
  let contextLines = 0;

  for (const line of lines) {
    if (line.kind === "context") {
      patternLines.push(line.value);
      replacementLines.push(line.value);
      contextLines += 1;
      continue;
    }

    if (line.kind === "addition") {
      replacementLines.push(line.value);
      additions += 1;
      continue;
    }

    patternLines.push(line.value);
    deletions += 1;
  }

  if (additions === 0 && deletions === 0) {
    throw new Error("Patch document must contain at least one '+' or '-' line.");
  }

  const pattern = patternLines.join("\n");
  const replacement = replacementLines.join("\n");

  return {
    pattern: trailingNewline ? `${pattern}\n` : pattern,
    replacement: trailingNewline ? `${replacement}\n` : replacement,
    additions,
    deletions,
    contextLines,
    trailingNewline,
  };
}
