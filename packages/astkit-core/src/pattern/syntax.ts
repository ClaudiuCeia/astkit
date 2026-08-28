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
import {
  ELLIPSIS_CAPTURE_PREFIX,
  type CompiledTemplate,
  type EllipsisToken,
  type HoleToken,
  type TemplateToken,
  type TextToken,
} from "./types.ts";

const HOLE_INNER_NAME_PATTERN = /(?:[A-Za-z_][A-Za-z0-9_]*|_)/;
const MAX_HOLE_REGEX_CONSTRAINT_LENGTH = 256;
const MAX_REGEX_AMBIGUITY_EXPANSIONS = 256;
const MAX_REGEX_BOUNDED_REPETITION_WORK = 2048;
const MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK = 2;

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

type RegexSafetyToken =
  | {
      kind: "escaped";
      value: string;
    }
  | {
      kind: "characterClass";
      value: string;
    }
  | {
      kind: "groupOpen";
      value: string;
      lookaround: boolean;
    }
  | {
      kind: "groupClose";
      value: ")";
    }
  | {
      kind: "quantifier";
      value: string;
    }
  | {
      kind: "alternation";
      value: "|";
    }
  | {
      kind: "unsupported";
      value: string;
    }
  | {
      kind: "literal";
      value: string;
    };

const escapedRegexSafetyTokenParser = map(
  any(
    parseRegex(/\\k<[^>]+>/, "named backreference"),
    parseRegex(/\\x[0-9A-Fa-f]{2}/, "hex escape"),
    parseRegex(/\\u[0-9A-Fa-f]{4}/, "unicode escape"),
    parseRegex(/\\c[A-Za-z]/, "control escape"),
    parseRegex(/\\0[0-9]+/, "legacy octal escape"),
    parseRegex(/\\./, "escaped character"),
  ),
  (value) =>
    ({
      kind: "escaped",
      value,
    }) satisfies RegexSafetyToken,
);

const charClassRegexSafetyTokenParser = map(
  parseRegex(/\[(?:\\.|[^\]\\])*\]/, "character class"),
  (value) =>
    ({
      kind: "characterClass",
      value,
    }) satisfies RegexSafetyToken,
);

const lookaroundGroupOpenRegexSafetyTokenParser = map(
  any(str("(?="), str("(?!"), str("(?<="), str("(?<!")),
  (value) =>
    ({
      kind: "groupOpen",
      value,
      lookaround: true,
    }) satisfies RegexSafetyToken,
);

const unsupportedGroupOpenRegexSafetyTokenParser = map(
  parseRegex(/\(\?(?:[ims]+(?:-[ims]+)?|-[ims]+):/, "regex modifier group"),
  (value) =>
    ({
      kind: "unsupported",
      value,
    }) satisfies RegexSafetyToken,
);

const nonLookaroundGroupOpenRegexSafetyTokenParser = map(
  any(str("(?:"), parseRegex(/\(\?<[_$A-Za-z][_$A-Za-z0-9]*>/, "named capture"), str("(")),
  (value) =>
    ({
      kind: "groupOpen",
      value,
      lookaround: false,
    }) satisfies RegexSafetyToken,
);

const groupCloseRegexSafetyTokenParser = map(
  str(")"),
  () =>
    ({
      kind: "groupClose",
      value: ")",
    }) satisfies RegexSafetyToken,
);

const quantifierRegexSafetyTokenParser = map(
  parseRegex(/(?:\*|\+|\?|\{(?:\d+)(?:,(?:\d+)?)?\})\??/, "quantifier"),
  (value) =>
    ({
      kind: "quantifier",
      value,
    }) satisfies RegexSafetyToken,
);

const alternationRegexSafetyTokenParser = map(
  str("|"),
  () =>
    ({
      kind: "alternation",
      value: "|",
    }) satisfies RegexSafetyToken,
);

const literalRegexSafetyTokenParser = map(
  minus(anyChar(), eof()),
  (value) =>
    ({
      kind: "literal",
      value,
    }) satisfies RegexSafetyToken,
);

const regexSafetyScannerParser = map(
  seq(
    many(
      any(
        escapedRegexSafetyTokenParser,
        charClassRegexSafetyTokenParser,
        lookaroundGroupOpenRegexSafetyTokenParser,
        unsupportedGroupOpenRegexSafetyTokenParser,
        nonLookaroundGroupOpenRegexSafetyTokenParser,
        groupCloseRegexSafetyTokenParser,
        quantifierRegexSafetyTokenParser,
        alternationRegexSafetyTokenParser,
        literalRegexSafetyTokenParser,
      ),
    ),
    eof(),
  ),
  ([tokens]) => tokens as RegexSafetyToken[],
);

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

  const mergedTokens: RawTemplateToken[] = [];
  for (const token of parsed.value) {
    const previous = mergedTokens[mergedTokens.length - 1];
    if (token.kind === "text" && previous?.kind === "text") {
      mergedTokens[mergedTokens.length - 1] = {
        kind: "text",
        value: previous.value + token.value,
      };
      continue;
    }
    mergedTokens.push(token);
  }

  let ellipsisIndex = 0;
  return mergedTokens.map((token) => resolveRawToken(token, () => ellipsisIndex++));
}

export function compileTemplate(source: string): CompiledTemplate {
  if (source.length === 0) {
    throw new Error("Template cannot be empty.");
  }

  const tokens = tokenizeTemplate(source);
  if (tokens.length === 0) {
    throw new Error("Template did not produce any tokens.");
  }

  const reservedHole = tokens.find(
    (token) => token.kind === "hole" && token.name.startsWith(ELLIPSIS_CAPTURE_PREFIX),
  );
  if (reservedHole?.kind === "hole") {
    throw new Error(`Hole name "${reservedHole.name}" uses a reserved prefix.`);
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

type RegexCharacterSet = {
  ascii: Set<number>;
  nonAscii: boolean;
};

type RegexExpression =
  | { kind: "empty" }
  | { kind: "atom"; characters: RegexCharacterSet; nullable: boolean }
  | { kind: "sequence"; parts: RegexExpression[] }
  | { kind: "alternation"; branches: RegexExpression[] }
  | { kind: "repeat"; operand: RegexExpression; minimum: number; maximum: number };

type RegexExpressionParseResult =
  | { success: true; expression: RegexExpression }
  | { success: false };

const emptyRegexCharacterSet = (): RegexCharacterSet => ({
  ascii: new Set<number>(),
  nonAscii: false,
});

function anyRegexCharacterSet(): RegexCharacterSet {
  return {
    ascii: new Set(Array.from({ length: 128 }, (_, code) => code)),
    nonAscii: true,
  };
}

function literalRegexCharacterSet(value: string): RegexCharacterSet {
  const code = value.codePointAt(0);
  if (code === undefined) {
    return emptyRegexCharacterSet();
  }
  return code < 128
    ? { ascii: new Set([code]), nonAscii: false }
    : { ascii: new Set<number>(), nonAscii: true };
}

function unionRegexCharacterSets(sets: RegexCharacterSet[]): RegexCharacterSet {
  const result = emptyRegexCharacterSet();
  for (const set of sets) {
    for (const code of set.ascii) {
      result.ascii.add(code);
    }
    result.nonAscii ||= set.nonAscii;
  }
  return result;
}

function regexCharacterSetsOverlap(left: RegexCharacterSet, right: RegexCharacterSet): boolean {
  if (left.nonAscii && right.nonAscii) {
    return true;
  }
  for (const code of left.ascii) {
    if (right.ascii.has(code)) {
      return true;
    }
  }
  return false;
}

function regexCharacterClassSet(source: string): RegexCharacterSet {
  try {
    const regex = new RegExp(`^(?:${source})$`);
    const ascii = new Set<number>();
    for (let code = 0; code < 128; code += 1) {
      if (regex.test(String.fromCharCode(code))) {
        ascii.add(code);
      }
    }
    const body = source.slice(1, -1);
    const nonAscii =
      source.startsWith("[^") ||
      /\\(?:[DSsWpPxu]|[0-9])/u.test(body) ||
      Array.from(body).some((character) => (character.codePointAt(0) ?? 0) > 127);
    return { ascii, nonAscii };
  } catch {
    return anyRegexCharacterSet();
  }
}

function escapedRegexCharacterSet(source: string): RegexCharacterSet | null {
  const escaped = source[1];
  if (escaped === "b" || escaped === "B") {
    return null;
  }

  const matchesAscii = (pattern: RegExp): RegexCharacterSet => ({
    ascii: new Set(
      Array.from({ length: 128 }, (_, code) => code).filter((code) =>
        pattern.test(String.fromCharCode(code)),
      ),
    ),
    nonAscii: false,
  });

  if (/^\\x[0-9A-Fa-f]{2}$/u.test(source)) {
    return literalRegexCharacterSet(String.fromCharCode(Number.parseInt(source.slice(2), 16)));
  }
  if (/^\\u[0-9A-Fa-f]{4}$/u.test(source)) {
    return literalRegexCharacterSet(String.fromCharCode(Number.parseInt(source.slice(2), 16)));
  }
  if (/^\\c[A-Za-z]$/u.test(source)) {
    return literalRegexCharacterSet(String.fromCharCode((source.codePointAt(2) ?? 64) % 32));
  }

  switch (escaped) {
    case "0":
      return literalRegexCharacterSet("\0");
    case "d":
      return matchesAscii(/\d/);
    case "w":
      return matchesAscii(/\w/);
    case "s":
      return { ...matchesAscii(/\s/), nonAscii: true };
    case "D":
    case "W":
    case "S":
      return anyRegexCharacterSet();
    case "n":
      return literalRegexCharacterSet("\n");
    case "r":
      return literalRegexCharacterSet("\r");
    case "t":
      return literalRegexCharacterSet("\t");
    case "f":
      return literalRegexCharacterSet("\f");
    case "v":
      return literalRegexCharacterSet("\v");
    default:
      return source.length === 2 && escaped
        ? literalRegexCharacterSet(escaped)
        : anyRegexCharacterSet();
  }
}

function regexAtomExpression(token: RegexSafetyToken): RegexExpression | null {
  if (token.kind === "characterClass") {
    return { kind: "atom", characters: regexCharacterClassSet(token.value), nullable: false };
  }
  if (token.kind === "escaped") {
    const characters = escapedRegexCharacterSet(token.value);
    return characters
      ? { kind: "atom", characters, nullable: false }
      : { kind: "atom", characters: emptyRegexCharacterSet(), nullable: true };
  }
  if (token.kind === "literal") {
    if (token.value === "^" || token.value === "$") {
      return { kind: "atom", characters: emptyRegexCharacterSet(), nullable: true };
    }
    return {
      kind: "atom",
      characters:
        token.value === "." ? anyRegexCharacterSet() : literalRegexCharacterSet(token.value),
      nullable: false,
    };
  }
  return null;
}

function parseRegexQuantifier(value: string): { minimum: number; maximum: number } | null {
  const greedy = value.endsWith("?") && value !== "?" ? value.slice(0, -1) : value;
  if (greedy === "*") return { minimum: 0, maximum: Number.POSITIVE_INFINITY };
  if (greedy === "+") return { minimum: 1, maximum: Number.POSITIVE_INFINITY };
  if (greedy === "?") return { minimum: 0, maximum: 1 };

  const range = greedy.match(/^\{(\d+)(?:,(\d*)?)?\}$/u);
  if (!range) {
    return null;
  }
  const minimum = Number(range[1]);
  const unbounded = range[2] === "";
  const maximum =
    range[2] === undefined ? minimum : unbounded ? Number.POSITIVE_INFINITY : Number(range[2]);
  if (
    !Number.isSafeInteger(minimum) ||
    (!unbounded && (!Number.isSafeInteger(maximum) || maximum < minimum))
  ) {
    return null;
  }
  return { minimum, maximum };
}

function parseRegexSafetyExpression(tokens: RegexSafetyToken[]): RegexExpressionParseResult {
  let index = 0;
  let failed = false;

  const parseAlternation = (insideGroup: boolean): RegexExpression => {
    const branches = [parseSequence(insideGroup)];
    while (tokens[index]?.kind === "alternation") {
      index += 1;
      branches.push(parseSequence(insideGroup));
    }
    return branches.length === 1 ? branches[0]! : { kind: "alternation", branches };
  };

  const parseSequence = (insideGroup: boolean): RegexExpression => {
    const parts: RegexExpression[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (!token || token.kind === "alternation" || token.kind === "groupClose") {
        break;
      }
      if (token.kind === "quantifier") {
        failed = true;
        index += 1;
        continue;
      }

      let expression: RegexExpression | null = null;
      if (token.kind === "groupOpen") {
        index += 1;
        expression = parseAlternation(true);
        if (tokens[index]?.kind !== "groupClose") {
          failed = true;
          return { kind: "empty" };
        }
        index += 1;
      } else {
        expression = regexAtomExpression(token);
        index += 1;
      }

      if (!expression) {
        failed = true;
        continue;
      }

      const quantifier = tokens[index];
      if (quantifier?.kind === "quantifier") {
        const range = parseRegexQuantifier(quantifier.value);
        if (!range) {
          failed = true;
        } else {
          expression = { kind: "repeat", operand: expression, ...range };
        }
        index += 1;
        if (tokens[index]?.kind === "quantifier") {
          failed = true;
        }
      }
      parts.push(expression);
    }

    if (!insideGroup && tokens[index]?.kind === "groupClose") {
      failed = true;
    }
    if (parts.length === 0) return { kind: "empty" };
    return parts.length === 1 ? parts[0]! : { kind: "sequence", parts };
  };

  const expression = parseAlternation(false);
  if (index !== tokens.length) {
    failed = true;
  }
  return failed ? { success: false } : { success: true, expression };
}

function isNullableRegexExpression(expression: RegexExpression): boolean {
  switch (expression.kind) {
    case "empty":
      return true;
    case "atom":
      return expression.nullable;
    case "sequence":
      return expression.parts.every(isNullableRegexExpression);
    case "alternation":
      return expression.branches.some(isNullableRegexExpression);
    case "repeat":
      return expression.minimum === 0 || isNullableRegexExpression(expression.operand);
  }
}

function firstRegexCharacters(expression: RegexExpression): RegexCharacterSet {
  switch (expression.kind) {
    case "empty":
      return emptyRegexCharacterSet();
    case "atom":
      return expression.characters;
    case "alternation":
      return unionRegexCharacterSets(expression.branches.map(firstRegexCharacters));
    case "repeat":
      return firstRegexCharacters(expression.operand);
    case "sequence": {
      const sets: RegexCharacterSet[] = [];
      for (const part of expression.parts) {
        sets.push(firstRegexCharacters(part));
        if (!isNullableRegexExpression(part)) break;
      }
      return unionRegexCharacterSets(sets);
    }
  }
}

function lastRegexCharacters(expression: RegexExpression): RegexCharacterSet {
  switch (expression.kind) {
    case "empty":
      return emptyRegexCharacterSet();
    case "atom":
      return expression.characters;
    case "alternation":
      return unionRegexCharacterSets(expression.branches.map(lastRegexCharacters));
    case "repeat":
      return lastRegexCharacters(expression.operand);
    case "sequence": {
      const sets: RegexCharacterSet[] = [];
      for (let index = expression.parts.length - 1; index >= 0; index -= 1) {
        const part = expression.parts[index];
        if (!part) continue;
        sets.push(lastRegexCharacters(part));
        if (!isNullableRegexExpression(part)) break;
      }
      return unionRegexCharacterSets(sets);
    }
  }
}

function leadingVariableRepetitionCharacters(expression: RegexExpression): RegexCharacterSet[] {
  if (expression.kind === "repeat") {
    return expression.maximum > 0 && expression.minimum !== expression.maximum
      ? [firstRegexCharacters(expression.operand)]
      : [];
  }
  if (expression.kind === "alternation") {
    return expression.branches.flatMap(leadingVariableRepetitionCharacters);
  }
  if (expression.kind === "sequence") {
    const characters: RegexCharacterSet[] = [];
    for (const part of expression.parts) {
      characters.push(...leadingVariableRepetitionCharacters(part));
      if (!isNullableRegexExpression(part)) break;
    }
    return characters;
  }
  return [];
}

function trailingVariableRepetitionCharacters(expression: RegexExpression): RegexCharacterSet[] {
  if (expression.kind === "repeat") {
    return expression.maximum > 0 && expression.minimum !== expression.maximum
      ? [lastRegexCharacters(expression.operand)]
      : [];
  }
  if (expression.kind === "alternation") {
    return expression.branches.flatMap(trailingVariableRepetitionCharacters);
  }
  if (expression.kind === "sequence") {
    const characters: RegexCharacterSet[] = [];
    for (let index = expression.parts.length - 1; index >= 0; index -= 1) {
      const part = expression.parts[index];
      if (!part) continue;
      characters.push(...trailingVariableRepetitionCharacters(part));
      if (!isNullableRegexExpression(part)) break;
    }
    return characters;
  }
  return [];
}

type RegexPath = RegexCharacterSet[];

function appendRegexPaths(left: RegexPath[], right: RegexPath[]): RegexPath[] | null {
  if (left.length * right.length > MAX_REGEX_AMBIGUITY_EXPANSIONS) {
    return null;
  }
  return left.flatMap((leftPath) => right.map((rightPath) => [...leftPath, ...rightPath]));
}

function expandRegexPaths(expression: RegexExpression): RegexPath[] | null {
  switch (expression.kind) {
    case "empty":
      return [[]];
    case "atom":
      return expression.nullable ? [[]] : [[expression.characters]];
    case "alternation": {
      const paths: RegexPath[] = [];
      for (const branch of expression.branches) {
        const branchPaths = expandRegexPaths(branch);
        if (!branchPaths || paths.length + branchPaths.length > MAX_REGEX_AMBIGUITY_EXPANSIONS) {
          return null;
        }
        paths.push(...branchPaths);
      }
      return paths;
    }
    case "sequence": {
      let paths: RegexPath[] = [[]];
      for (const part of expression.parts) {
        const partPaths = expandRegexPaths(part);
        if (!partPaths) return null;
        const combined = appendRegexPaths(paths, partPaths);
        if (!combined) return null;
        paths = combined;
      }
      return paths;
    }
    case "repeat": {
      if (
        expression.minimum !== expression.maximum ||
        expression.maximum > MAX_REGEX_AMBIGUITY_EXPANSIONS
      ) {
        return null;
      }
      const operandPaths = expandRegexPaths(expression.operand);
      if (!operandPaths) return null;
      let paths: RegexPath[] = [[]];
      for (let count = 0; count < expression.maximum; count += 1) {
        const combined = appendRegexPaths(paths, operandPaths);
        if (!combined) return null;
        paths = combined;
      }
      return paths;
    }
  }
}

function regexPathsOverlapAsPrefix(left: RegexPath, right: RegexPath): boolean {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (!regexCharacterSetsOverlap(left[index]!, right[index]!)) {
      return false;
    }
  }
  return true;
}

function alternativeBranchesAreAmbiguous(expression: RegexExpression): boolean {
  if (expression.kind !== "alternation") return false;

  const branchPaths = expression.branches.map(expandRegexPaths);
  for (let left = 0; left < expression.branches.length; left += 1) {
    for (let right = left + 1; right < expression.branches.length; right += 1) {
      const leftPaths = branchPaths[left];
      const rightPaths = branchPaths[right];
      if (!leftPaths || !rightPaths) {
        if (
          isNullableRegexExpression(expression.branches[left]!) ||
          isNullableRegexExpression(expression.branches[right]!) ||
          regexCharacterSetsOverlap(
            firstRegexCharacters(expression.branches[left]!),
            firstRegexCharacters(expression.branches[right]!),
          )
        ) {
          return true;
        }
        continue;
      }
      if (
        leftPaths.some((leftPath) =>
          rightPaths.some((rightPath) => regexPathsOverlapAsPrefix(leftPath, rightPath)),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasAmbiguousAlternatives(expression: RegexExpression): boolean {
  if (alternativeBranchesAreAmbiguous(expression)) return true;
  if (expression.kind === "sequence") {
    return expression.parts.some(hasAmbiguousAlternatives);
  }
  if (expression.kind === "alternation") {
    return expression.branches.some(hasAmbiguousAlternatives);
  }
  if (expression.kind === "repeat") {
    return hasAmbiguousAlternatives(expression.operand);
  }
  return false;
}

function containsVariableRegexRepetition(expression: RegexExpression): boolean {
  if (expression.kind === "repeat") {
    return (
      expression.minimum !== expression.maximum ||
      containsVariableRegexRepetition(expression.operand)
    );
  }
  if (expression.kind === "sequence") {
    return expression.parts.some(containsVariableRegexRepetition);
  }
  if (expression.kind === "alternation") {
    return expression.branches.some(containsVariableRegexRepetition);
  }
  return false;
}

function cappedRegexWorkProduct(left: number, right: number, maximum: number): number {
  if (left === 0 || right === 0) return 0;
  if (left > maximum / right) return maximum + 1;
  return left * right;
}

function cappedRegexWorkSum(left: number, right: number, maximum: number): number {
  return Math.min(left + right, maximum + 1);
}

function regexBoundedRepetitionWork(expression: RegexExpression): number {
  if (expression.kind === "empty" || expression.kind === "atom") return 0;
  if (expression.kind === "alternation") {
    return Math.max(...expression.branches.map(regexBoundedRepetitionWork));
  }
  if (expression.kind === "sequence") {
    let work = 0;
    for (const part of expression.parts) {
      work = cappedRegexWorkSum(
        work,
        regexBoundedRepetitionWork(part),
        MAX_REGEX_BOUNDED_REPETITION_WORK,
      );
      if (work > MAX_REGEX_BOUNDED_REPETITION_WORK) return work;
    }
    return work;
  }

  const operandWork = regexBoundedRepetitionWork(expression.operand);
  if (!Number.isFinite(expression.maximum)) return operandWork;
  return cappedRegexWorkProduct(
    expression.maximum,
    Math.max(1, operandWork),
    MAX_REGEX_BOUNDED_REPETITION_WORK,
  );
}

function regexNestedVariableRepetitionWork(
  expression: RegexExpression,
  fixedMultiplier = 1,
): number {
  if (expression.kind === "empty" || expression.kind === "atom") return 0;
  if (expression.kind === "alternation") {
    return Math.max(
      ...expression.branches.map((branch) =>
        regexNestedVariableRepetitionWork(branch, fixedMultiplier),
      ),
    );
  }
  if (expression.kind === "sequence") {
    let work = 0;
    for (const part of expression.parts) {
      const partWork = regexNestedVariableRepetitionWork(part, fixedMultiplier);
      if (partWork === 0) continue;
      work =
        work === 0
          ? partWork
          : cappedRegexWorkProduct(work, partWork, MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK);
      if (work > MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK) return work;
    }
    return work;
  }

  if (expression.minimum !== expression.maximum) {
    if (containsVariableRegexRepetition(expression.operand)) {
      if (!Number.isFinite(expression.maximum)) {
        return MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK + 1;
      }
      const nestedMultiplier = cappedRegexWorkProduct(
        fixedMultiplier,
        expression.maximum,
        MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK,
      );
      return regexNestedVariableRepetitionWork(expression.operand, nestedMultiplier);
    }
    return Math.max(
      fixedMultiplier,
      regexNestedVariableRepetitionWork(expression.operand, fixedMultiplier),
    );
  }

  const nestedMultiplier = cappedRegexWorkProduct(
    fixedMultiplier,
    expression.maximum,
    MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK,
  );
  return regexNestedVariableRepetitionWork(expression.operand, nestedMultiplier);
}

const REGEX_AMBIGUITY_BUDGET_EXCEEDED = MAX_REGEX_AMBIGUITY_EXPANSIONS + 1;

function addRegexAmbiguityExpansions(left: number, right: number): number {
  return Math.min(left + right, REGEX_AMBIGUITY_BUDGET_EXCEEDED);
}

function multiplyRegexAmbiguityExpansions(left: number, right: number): number {
  if (left > MAX_REGEX_AMBIGUITY_EXPANSIONS / right) {
    return REGEX_AMBIGUITY_BUDGET_EXCEEDED;
  }
  return left * right;
}

function powerRegexAmbiguityExpansions(base: number, exponent: number): number {
  let result = 1;
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) {
      result = multiplyRegexAmbiguityExpansions(result, factor);
      if (result > MAX_REGEX_AMBIGUITY_EXPANSIONS) return result;
    }
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) {
      factor = multiplyRegexAmbiguityExpansions(factor, factor);
    }
  }
  return result;
}

function regexAmbiguityExpansionCount(expression: RegexExpression): number {
  if (expression.kind === "empty" || expression.kind === "atom") return 1;

  if (expression.kind === "sequence") {
    let expansions = 1;
    for (const part of expression.parts) {
      expansions = multiplyRegexAmbiguityExpansions(expansions, regexAmbiguityExpansionCount(part));
      if (expansions > MAX_REGEX_AMBIGUITY_EXPANSIONS) return expansions;
    }
    return expansions;
  }

  if (expression.kind === "alternation") {
    const branchExpansions = expression.branches.map(regexAmbiguityExpansionCount);
    if (!alternativeBranchesAreAmbiguous(expression)) {
      return Math.max(...branchExpansions);
    }
    return branchExpansions.reduce(addRegexAmbiguityExpansions, 0);
  }

  const operandExpansions = regexAmbiguityExpansionCount(expression.operand);
  if (!Number.isFinite(expression.maximum)) {
    return operandExpansions > 1 ? REGEX_AMBIGUITY_BUDGET_EXCEEDED : operandExpansions;
  }
  if (expression.minimum === expression.maximum) {
    return powerRegexAmbiguityExpansions(operandExpansions, expression.maximum);
  }
  if (operandExpansions === 1) {
    if (!isNullableRegexExpression(expression.operand)) return 1;
    return Math.min(expression.maximum - expression.minimum + 1, REGEX_AMBIGUITY_BUDGET_EXCEEDED);
  }

  let expansions = 0;
  let repeatedExpansions = powerRegexAmbiguityExpansions(operandExpansions, expression.minimum);
  for (let count = expression.minimum; count <= expression.maximum; count += 1) {
    expansions = addRegexAmbiguityExpansions(expansions, repeatedExpansions);
    if (expansions > MAX_REGEX_AMBIGUITY_EXPANSIONS) return expansions;
    repeatedExpansions = multiplyRegexAmbiguityExpansions(repeatedExpansions, operandExpansions);
  }
  return expansions;
}

function findRegexSafetyIssue(expression: RegexExpression): string | null {
  if (expression.kind === "repeat") {
    if (!Number.isFinite(expression.maximum) && isNullableRegexExpression(expression.operand)) {
      return "repetition of a nullable expression is not allowed";
    }
    if (!Number.isFinite(expression.maximum) && hasAmbiguousAlternatives(expression.operand)) {
      return "repetition with ambiguous alternatives is not allowed";
    }
    return findRegexSafetyIssue(expression.operand);
  }

  if (expression.kind === "alternation") {
    for (const branch of expression.branches) {
      const issue = findRegexSafetyIssue(branch);
      if (issue) return issue;
    }
    return null;
  }

  if (expression.kind === "sequence") {
    for (let left = 0; left < expression.parts.length; left += 1) {
      const leftPart = expression.parts[left];
      if (!leftPart) {
        continue;
      }
      const leftRepetitions = trailingVariableRepetitionCharacters(leftPart);
      if (leftRepetitions.length === 0) continue;

      let separatorIsNullable = true;
      for (let right = left + 1; right < expression.parts.length; right += 1) {
        const rightPart = expression.parts[right];
        if (!rightPart) continue;
        if (separatorIsNullable) {
          const rightRepetitions = leadingVariableRepetitionCharacters(rightPart);
          if (
            leftRepetitions.some((leftCharacters) =>
              rightRepetitions.some((rightCharacters) =>
                regexCharacterSetsOverlap(leftCharacters, rightCharacters),
              ),
            )
          ) {
            return "overlapping sibling repetitions are not allowed";
          }
        }
        separatorIsNullable &&= isNullableRegexExpression(rightPart);
        if (!separatorIsNullable) break;
      }
    }

    for (const part of expression.parts) {
      const issue = findRegexSafetyIssue(part);
      if (issue) return issue;
    }
  }

  return null;
}

function scanRegexSafety(source: string): { safe: true } | { safe: false; reason: string } {
  const parsed = regexSafetyScannerParser({ text: source, index: 0 });
  if (!parsed.success) {
    return { safe: false, reason: "regex safety scanner could not parse the constraint" };
  }

  for (let index = 0; index < parsed.value.length; index += 1) {
    const token = parsed.value[index];
    if (!token) {
      continue;
    }

    if (token.kind === "unsupported") {
      return {
        safe: false,
        reason: "regex modifier groups are not allowed",
      };
    }

    if (token.kind === "escaped") {
      const escaped = token.value[1];
      if (!escaped) {
        continue;
      }
      if (/[1-9]/.test(escaped)) {
        return {
          safe: false,
          reason: "backreferences (for example \\1) are not allowed",
        };
      }
      if (escaped === "k" && token.value[2] === "<") {
        return {
          safe: false,
          reason: "named backreferences (for example \\k<name>) are not allowed",
        };
      }
      if (escaped === "0" && token.value.length > 2) {
        return {
          safe: false,
          reason: "legacy octal escapes are not allowed",
        };
      }
      if (token.value === "\\c") {
        return {
          safe: false,
          reason: "incomplete control escapes are not allowed",
        };
      }
      continue;
    }

    if (token.kind === "groupOpen") {
      if (token.lookaround) {
        return {
          safe: false,
          reason: "lookaround assertions are not allowed",
        };
      }
    }
  }

  const expression = parseRegexSafetyExpression(parsed.value);
  if (!expression.success) {
    return { safe: false, reason: "regex safety analysis could not parse the constraint" };
  }
  const issue = findRegexSafetyIssue(expression.expression);
  if (issue) {
    return { safe: false, reason: issue };
  }
  if (
    regexNestedVariableRepetitionWork(expression.expression) >
    MAX_REGEX_NESTED_VARIABLE_REPETITION_WORK
  ) {
    return {
      safe: false,
      reason: "nested quantifiers with compounding variable repetitions are not allowed",
    };
  }
  if (regexBoundedRepetitionWork(expression.expression) > MAX_REGEX_BOUNDED_REPETITION_WORK) {
    return {
      safe: false,
      reason: `bounded regex repetition exceeds ${MAX_REGEX_BOUNDED_REPETITION_WORK} work units`,
    };
  }
  if (regexAmbiguityExpansionCount(expression.expression) > MAX_REGEX_AMBIGUITY_EXPANSIONS) {
    return {
      safe: false,
      reason: `cumulative regex ambiguity exceeds ${MAX_REGEX_AMBIGUITY_EXPANSIONS} expansions`,
    };
  }

  return { safe: true };
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
