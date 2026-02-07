import {
  any,
  anyChar,
  cut,
  eof,
  formatErrorCompact,
  many,
  many1,
  map,
  mapJoin,
  minus,
  optional,
  regex as parseRegex,
  seq,
  str,
} from "@claudiu-ceia/combine";
import type { CompiledTemplate, HoleToken, TemplateToken, TextToken } from "./types.ts";

const HOLE_INNER_NAME_PATTERN = /(?:[A-Za-z_][A-Za-z0-9_]*|_)/;

type RawHoleToken = {
  kind: "hole";
  name: string;
  anonymous: boolean;
  constraintSource: string | null;
};

type RawTemplateToken = TextToken | RawHoleToken;

const holeNameParser = parseRegex(HOLE_INNER_NAME_PATTERN, "hole name");

const escapedConstraintCharacterParser = map(
  seq(str("\\"), anyChar()),
  ([slash, character]) => `${slash}${character}`,
);

const charClassCharacterParser = any(
  escapedConstraintCharacterParser,
  parseRegex(/[^\]]/, "character class character"),
);

const charClassParser = map(
  seq(str("["), mapJoin(many(charClassCharacterParser)), str("]")),
  ([open, body, close]) => `${open}${body}${close}`,
);

const regexConstraintCharacterParser = any(
  escapedConstraintCharacterParser,
  charClassParser,
  parseRegex(/[^\]]/, "regex constraint character"),
);

const regexConstraintParser = mapJoin(many1(regexConstraintCharacterParser));

const holeTokenParser = map(
  seq(
    str(":["),
    cut(holeNameParser, "hole name"),
    optional(seq(str("~"), cut(regexConstraintParser, "regex constraint"))),
    cut(str("]"), "closing ']'"),
  ),
  ([, name, constraint]) => {
    const constraintSource = constraint ? constraint[1] : null;
    return {
      kind: "hole",
      name,
      anonymous: name === "_",
      constraintSource,
    } satisfies RawHoleToken;
  },
);

const textTokenParser = map(
  mapJoin(many1(minus(anyChar(), str(":[")))),
  (value) => ({ kind: "text", value } satisfies TextToken),
);

const templateTokensParser = map(
  seq(many(any(holeTokenParser, textTokenParser)), eof()),
  ([tokens]) => tokens as RawTemplateToken[],
);

export function tokenizeTemplate(source: string): TemplateToken[] {
  const parsed = templateTokensParser({ text: source, index: 0 });
  if (!parsed.success) {
    throw new Error(`Invalid template: ${formatErrorCompact(parsed)}`);
  }

  return parsed.value.map(resolveRawToken);
}

export function compileTemplate(source: string): CompiledTemplate {
  if (source.length === 0) {
    throw new Error("Template cannot be empty.");
  }

  const tokens = tokenizeTemplate(source);
  if (tokens.length === 0) {
    throw new Error("Template did not produce any tokens.");
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (current && next && current.kind === "hole" && next.kind === "hole") {
      throw new Error(
        "Adjacent holes are ambiguous. Add a literal delimiter between them.",
      );
    }
  }

  const literalLength = tokens.reduce(
    (total, token) => total + (token.kind === "text" ? token.value.length : 0),
    0,
  );
  if (literalLength === 0) {
    throw new Error(
      "Template must include at least one literal character to avoid empty matches.",
    );
  }

  return { source, tokens };
}

function resolveRawToken(token: RawTemplateToken): TemplateToken {
  if (token.kind === "text") {
    return token;
  }

  if (token.constraintSource === null) {
    return {
      kind: "hole",
      name: token.name,
      anonymous: token.anonymous,
      constraintSource: token.constraintSource,
      constraintRegex: null,
    } satisfies HoleToken;
  }

  try {
    return {
      kind: "hole",
      name: token.name,
      anonymous: token.anonymous,
      constraintSource: token.constraintSource,
      constraintRegex: new RegExp(`^(?:${token.constraintSource})$`, "s"),
    } satisfies HoleToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid regex constraint for hole "${token.name}": ${message}`,
    );
  }
}
