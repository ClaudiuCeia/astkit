import { eof, map, regex as parseRegex, seq, str } from "@claudiu-ceia/combine";

export type FilePosition = {
  file: string;
  line: number;
  character: number;
};

const LOCATION_ERROR_MESSAGE = "Invalid location: expected <file>:<line>:<character>.";

const positiveIntegerParser = parseRegex(/[1-9][0-9]*/, "positive integer");

const fileForColonSyntaxParser = parseRegex(/[^\n]+(?=:[1-9][0-9]*:[1-9][0-9]*$)/, "file path");

const colonFilePositionParser = map(
  seq(
    fileForColonSyntaxParser,
    str(":"),
    positiveIntegerParser,
    str(":"),
    positiveIntegerParser,
    eof(),
  ),
  ([file, , line, , character]) =>
    ({
      file: file.trim(),
      line: parsePositiveInteger(line, "line"),
      character: parsePositiveInteger(character, "character"),
    }) satisfies FilePosition,
);

export function parseFilePosition(input: string): FilePosition {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error(LOCATION_ERROR_MESSAGE);
  }

  const parsed = colonFilePositionParser({ text: raw, index: 0 });
  if (!parsed.success) {
    throw new Error(LOCATION_ERROR_MESSAGE);
  }

  const file = parsed.value.file.trim();
  if (file.length === 0) {
    throw new Error("Invalid file: file path cannot be empty.");
  }

  return {
    file,
    line: parsed.value.line,
    character: parsed.value.character,
  };
}

function parsePositiveInteger(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: expected a positive integer.`);
  }
  return parsed;
}
