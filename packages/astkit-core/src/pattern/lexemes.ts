import {
  any,
  anyChar,
  eof,
  many,
  many1,
  map,
  mapJoin,
  minus,
  regex as parseRegex,
  seq,
  str,
} from "@claudiu-ceia/combine";

type LexemeScanPart =
  | {
      kind: "trivia";
      value: string;
    }
  | {
      kind: "lexeme";
      value: string;
    };

export type LexemeLayout = {
  leadingTrivia: string;
  lexemes: string[];
  separators: string[];
  trailingTrivia: string;
};

const MULTI_CHAR_OPERATORS = [
  ">>>=",
  "===",
  "!==",
  ">>=",
  "<<=",
  "&&=",
  "||=",
  "??=",
  "**=",
  ">>>",
  "...",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "++",
  "--",
  "&&",
  "||",
  "??",
  "?.",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  ">>",
  "<<",
  "**",
] as const;

const triviaParser = any(
  parseRegex(/\s+/, "whitespace"),
  parseRegex(/\/\/[^\n\r]*/, "line comment"),
  parseRegex(/\/\*[\s\S]*?\*\//, "block comment"),
);

const escapedCharacterParser = map(seq(str("\\"), anyChar()), ([slash, char]) => `${slash}${char}`);

const singleQuotedStringParser = map(
  seq(
    str("'"),
    mapJoin(many(any(escapedCharacterParser, parseRegex(/[^'\\]/, "string char")))),
    str("'"),
  ),
  ([open, body, close]) => `${open}${body}${close}`,
);

const doubleQuotedStringParser = map(
  seq(
    str('"'),
    mapJoin(many(any(escapedCharacterParser, parseRegex(/[^"\\]/, "string char")))),
    str('"'),
  ),
  ([open, body, close]) => `${open}${body}${close}`,
);

// Template literals with nested expressions are intentionally treated as mixed
// punctuation/identifier tokens. This parser handles plain template literals.
const plainTemplateLiteralParser = parseRegex(/`(?:\\.|[^`\\])*`/, "template literal");

const identifierParser = parseRegex(/[A-Za-z_$][A-Za-z0-9_$]*/, "identifier");
const numberParser = parseRegex(/(?:\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?|\.[\d_]+)/, "number");

const operatorParser = any(...MULTI_CHAR_OPERATORS.map((operator) => str(operator)));

const punctuationParser = map(minus(anyChar(), eof()), (char) => char);

const lexemeParser = any(
  singleQuotedStringParser,
  doubleQuotedStringParser,
  plainTemplateLiteralParser,
  identifierParser,
  numberParser,
  operatorParser,
  punctuationParser,
);

const lexemeScannerParser = map(
  seq(
    many(
      any(
        map(triviaParser, (value) => ({ kind: "trivia", value }) satisfies LexemeScanPart),
        map(lexemeParser, (value) => ({ kind: "lexeme", value }) satisfies LexemeScanPart),
      ),
    ),
    eof(),
  ),
  ([parts]) => parts,
);

const triviaPrefixPattern = /^(?:\s+|\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/;

export function collectLiteralLexemes(source: string): string[] {
  const layout = analyzeLexemeLayout(source);
  if (!layout) {
    return [];
  }
  return layout.lexemes;
}

export function analyzeLexemeLayout(source: string): LexemeLayout | null {
  const parsed = lexemeScannerParser({ text: source, index: 0 });
  if (!parsed.success) {
    return null;
  }

  const lexemes: string[] = [];
  const separators: string[] = [];
  let leadingTrivia = "";
  let trailingTrivia = "";
  let pendingTrivia = "";
  let sawLexeme = false;

  for (const part of parsed.value) {
    if (part.kind === "trivia") {
      pendingTrivia += part.value;
      continue;
    }

    if (!sawLexeme) {
      leadingTrivia = pendingTrivia;
      sawLexeme = true;
    } else {
      separators.push(pendingTrivia);
    }
    pendingTrivia = "";
    lexemes.push(part.value);
  }

  trailingTrivia = pendingTrivia;

  return {
    leadingTrivia,
    lexemes,
    separators,
    trailingTrivia,
  };
}

export function skipTrivia(source: string, fromIndex: number): number {
  let cursor = fromIndex;

  while (cursor < source.length) {
    const chunk = source.slice(cursor);
    const match = triviaPrefixPattern.exec(chunk);
    if (!match || match[0].length === 0) {
      break;
    }
    cursor += match[0].length;
  }

  return cursor;
}

export function trimTriviaBounds(
  source: string,
  fromIndex: number,
  toIndex: number,
): { start: number; end: number } {
  const start = trimLeadingWhitespace(source, fromIndex, toIndex);
  const end = trimTrailingTrivia(source, start, toIndex);
  return { start, end };
}

function trimTrailingTrivia(source: string, fromIndex: number, toIndex: number): number {
  let cursor = toIndex;

  while (cursor > fromIndex) {
    const candidate = source.slice(fromIndex, cursor);
    const trimmed = trimTrailingTriviaFromChunk(candidate);
    if (trimmed.length === candidate.length) {
      break;
    }
    cursor = fromIndex + trimmed.length;
  }

  return cursor;
}

function trimTrailingTriviaFromChunk(source: string): string {
  return source.replace(/\s+$/u, "");
}

export function hasTrailingTrivia(source: string): boolean {
  const layout = analyzeLexemeLayout(source);
  if (!layout) {
    return false;
  }
  return layout.trailingTrivia.length > 0;
}

function trimLeadingWhitespace(source: string, fromIndex: number, toIndex: number): number {
  let cursor = fromIndex;
  while (cursor < toIndex) {
    const char = source[cursor];
    if (!char || !/\s/u.test(char)) {
      break;
    }
    cursor += 1;
  }
  return cursor;
}
