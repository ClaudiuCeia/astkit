import {
  any,
  anyChar,
  cut,
  eof,
  formatErrorReport,
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
import { collectLiteralLexemes, hasTrailingTrivia } from "./lexemes.ts";
import type {
  CompiledTemplate,
  EllipsisToken,
  HoleToken,
  TemplateToken,
  TextToken,
} from "./types.ts";

const HOLE_INNER_NAME_PATTERN = /(?:[A-Za-z_][A-Za-z0-9_]*|_)/;
const MAX_HOLE_REGEX_CONSTRAINT_LENGTH = 256;

type RawHoleToken = {
  kind: "hole";
  name: string;
  anonymous: boolean;
  constraintSource: string | null;
};

type RawEllipsisToken = {
  kind: "ellipsis";
};

type RawTemplateToken = TextToken | RawHoleToken | RawEllipsisToken;

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

const ellipsisTokenParser = map(
  str("..."),
  () =>
    ({
      kind: "ellipsis",
    }) satisfies RawEllipsisToken,
);

const escapedTextTokenParser = map(
  seq(str("\\"), any(str("..."), str(":["), anyChar())),
  ([, value]) => ({ kind: "text", value }) satisfies TextToken,
);

const textTokenParser = map(
  mapJoin(many1(minus(anyChar(), any(str("..."), str(":["), str("\\"))))),
  (value) => ({ kind: "text", value }) satisfies TextToken,
);

const templateTokensParser = map(
  seq(
    many(any(holeTokenParser, ellipsisTokenParser, escapedTextTokenParser, textTokenParser)),
    eof(),
  ),
  ([tokens]) => tokens as RawTemplateToken[],
);

export function tokenizeTemplate(source: string): TemplateToken[] {
  const parsed = templateTokensParser({ text: source, index: 0 });
  if (!parsed.success) {
    const base = formatErrorReport(parsed, {
      color: false,
      contextLines: 0,
      stack: false,
    });
    const hint = buildTemplateParseHint(source, base);
    throw new Error(
      hint.length > 0 ? `Invalid template:\n${base}\nHint: ${hint}` : `Invalid template:\n${base}`,
    );
  }

  let ellipsisIndex = 0;
  return parsed.value.map((token) => resolveRawToken(token, () => ellipsisIndex++));
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
    if (current && next && current.kind !== "text" && next.kind !== "text") {
      throw new Error("Adjacent holes are ambiguous. Add a literal delimiter between them.");
    }
  }

  const literalLength = tokens.reduce(
    (total, token) =>
      total +
      (token.kind === "text"
        ? (token.lexemes ?? []).reduce((lexemeTotal, lexeme) => lexemeTotal + lexeme.length, 0)
        : 0),
    0,
  );
  if (literalLength === 0) {
    throw new Error("Template must include at least one literal character to avoid empty matches.");
  }

  return { source, tokens };
}

function resolveRawToken(token: RawTemplateToken, nextEllipsisIndex: () => number): TemplateToken {
  if (token.kind === "text") {
    return {
      kind: "text",
      value: token.value,
      lexemes: collectLiteralLexemes(token.value),
      hasTrailingTrivia: hasTrailingTrivia(token.value),
    } satisfies TextToken;
  }

  if (token.kind === "ellipsis") {
    return {
      kind: "ellipsis",
      index: nextEllipsisIndex(),
    } satisfies EllipsisToken;
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

  validateHoleRegexConstraint(token.name, token.constraintSource);

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
    throw new Error(`Invalid regex constraint for hole "${token.name}": ${message}`);
  }
}

function validateHoleRegexConstraint(name: string, source: string): void {
  if (source.length > MAX_HOLE_REGEX_CONSTRAINT_LENGTH) {
    throw new Error(
      `Regex constraint for hole "${name}" exceeds ${MAX_HOLE_REGEX_CONSTRAINT_LENGTH} characters.`,
    );
  }

  const scan = scanRegexSafety(source);
  if (!scan.safe) {
    throw new Error(`Unsafe regex constraint for hole "${name}": ${scan.reason}`);
  }
}

function scanRegexSafety(source: string): { safe: true } | { safe: false; reason: string } {
  type GroupState = { containsQuantifier: boolean };
  const groups: GroupState[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (!char) {
      continue;
    }

    if (char === "\\") {
      const escaped = source[index + 1];
      if (!escaped) {
        break;
      }
      if (/[1-9]/.test(escaped)) {
        return {
          safe: false,
          reason: "backreferences (for example \\1) are not allowed",
        };
      }
      if (escaped === "k" && source[index + 2] === "<") {
        return {
          safe: false,
          reason: "named backreferences (for example \\k<name>) are not allowed",
        };
      }
      index += 1;
      continue;
    }

    if (char === "[") {
      index = skipCharacterClass(source, index);
      continue;
    }

    if (char === "(") {
      if (
        source.startsWith("(?=", index) ||
        source.startsWith("(?!", index) ||
        source.startsWith("(?<=", index) ||
        source.startsWith("(?<!", index)
      ) {
        return {
          safe: false,
          reason: "lookaround assertions are not allowed",
        };
      }
      groups.push({ containsQuantifier: false });
      continue;
    }

    if (char === ")") {
      const closed = groups.pop();
      if (!closed) {
        continue;
      }

      const quantifierLength = readQuantifierLength(source, index + 1);
      if (quantifierLength > 0 && closed.containsQuantifier) {
        return {
          safe: false,
          reason: "nested quantifiers in grouped expressions are not allowed",
        };
      }
      if (closed.containsQuantifier) {
        const parent = groups[groups.length - 1];
        if (parent) {
          parent.containsQuantifier = true;
        }
      } else if (quantifierLength > 0) {
        const parent = groups[groups.length - 1];
        if (parent) {
          parent.containsQuantifier = true;
        }
      }
      continue;
    }

    const quantifierLength = readQuantifierLength(source, index);
    if (quantifierLength > 0) {
      const current = groups[groups.length - 1];
      if (current) {
        current.containsQuantifier = true;
      }
      index += quantifierLength - 1;
    }
  }

  return { safe: true };
}

function skipCharacterClass(source: string, fromIndex: number): number {
  for (let index = fromIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (!char) {
      return source.length - 1;
    }
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "]") {
      return index;
    }
  }
  return source.length - 1;
}

function readQuantifierLength(source: string, index: number): number {
  const char = source[index];
  if (!char) {
    return 0;
  }

  if (char === "*" || char === "+" || char === "?") {
    const lazy = source[index + 1] === "?" ? 2 : 1;
    return lazy;
  }

  if (char !== "{") {
    return 0;
  }

  const slice = source.slice(index);
  const match = slice.match(/^\{(\d+)(,(\d+)?)?\}\??/);
  if (!match) {
    return 0;
  }
  return match[0].length;
}

function buildTemplateParseHint(source: string, baseError: string): string {
  // When `:[` or `...` appear in source text they are treated as special tokens
  // unless escaped (e.g. `\\:[` or `\\...`).
  const hasUnclosedHole =
    source.lastIndexOf(":[") >= 0 && source.indexOf("]", source.lastIndexOf(":[") + 2) < 0;

  if (hasUnclosedHole && baseError.includes("closing ']'")) {
    return "If you meant a literal `:[` sequence (not a hole), escape it as `\\\\:[` (and `\\\\...` for a literal `...`).";
  }

  return "";
}
