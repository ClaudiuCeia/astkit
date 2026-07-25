import { isBalancedChunk } from "./balance.ts";
import {
  collectLiteralLexemes,
  type LexemeSpan,
  scanLexemeSpans,
  skipTrivia,
  trimTriviaBounds,
} from "./lexemes.ts";
import type {
  CompiledTemplate,
  HoleToken,
  TemplateMatch,
  TemplateToken,
  TextToken,
} from "./types.ts";
import { ELLIPSIS_CAPTURE_PREFIX } from "./types.ts";

type MatchResult = {
  end: number;
  captures: Map<string, string>;
};

type SourceLexemes = {
  spans: readonly LexemeSpan[];
  byStart: ReadonlyMap<number, LexemeSpan>;
  literalStarts: Map<TextToken, readonly number[]>;
};

type LiteralStarts = {
  values: readonly number[];
  startIndex: number;
};

const MAX_CONSTRAINED_CAPTURE_LENGTH = 2048;

export function findTemplateMatches(text: string, template: CompiledTemplate): TemplateMatch[] {
  const matches: TemplateMatch[] = [];
  const firstToken = template.tokens[0];
  const anchor = firstToken?.kind === "text" ? (getLiteralLexemes(firstToken)[0] ?? null) : null;
  const spans = scanLexemeSpans(text) ?? [];
  const sourceLexemes: SourceLexemes = {
    spans,
    byStart: new Map(spans.map((span) => [span.start, span])),
    literalStarts: new Map(),
  };
  const anchorCandidates =
    anchor && firstToken?.kind === "text"
      ? findLiteralStarts(text, firstToken, 0, sourceLexemes)
      : null;
  const anchorStarts = anchorCandidates?.values ?? null;
  let anchorIndex = anchorCandidates?.startIndex ?? 0;
  let cursor = 0;

  while (cursor <= text.length) {
    while (anchorStarts && (anchorStarts[anchorIndex] ?? Number.POSITIVE_INFINITY) < cursor) {
      anchorIndex += 1;
    }
    const start = anchorStarts ? (anchorStarts[anchorIndex++] ?? -1) : skipTrivia(text, cursor);
    if (start < 0 || (anchorStarts && start === -1)) {
      break;
    }

    const result = matchTokens(text, template.tokens, 0, start, new Map(), sourceLexemes);
    if (!result || result.end <= start) {
      cursor = start + 1;
      continue;
    }

    matches.push({
      start,
      end: result.end,
      text: text.slice(start, result.end),
      captures: Object.fromEntries(result.captures),
    });
    cursor = result.end;
  }

  return matches;
}

function matchTokens(
  text: string,
  tokens: readonly TemplateToken[],
  tokenIndex: number,
  cursor: number,
  captures: ReadonlyMap<string, string>,
  sourceLexemes: SourceLexemes,
): MatchResult | null {
  const token = tokens[tokenIndex];
  if (!token) {
    return { end: cursor, captures: new Map(captures) };
  }

  if (token.kind === "text") {
    const matched = matchTextToken(text, token, cursor, true, sourceLexemes);
    if (!matched) {
      return null;
    }

    return matchTokens(text, tokens, tokenIndex + 1, matched.end, captures, sourceLexemes);
  }

  if (token.kind === "ellipsis") {
    const nextLiteral = findNextLiteral(tokens, tokenIndex + 1);
    if (!nextLiteral) {
      const bounds = trimTriviaBounds(text, cursor, text.length);
      const chunk = text.slice(bounds.start, bounds.end);
      if (!isBalancedChunk(chunk)) {
        return null;
      }

      const nextCaptures = captureEllipsis(captures, token.index, chunk);
      return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures, sourceLexemes);
    }

    if (!haveFutureLiteralCandidates(text, tokens, tokenIndex + 1, cursor, sourceLexemes)) {
      return null;
    }

    const nextStarts = findLiteralStarts(text, nextLiteral, cursor, sourceLexemes);
    for (let index = nextStarts.values.length - 1; index >= nextStarts.startIndex; index -= 1) {
      const nextStart = nextStarts.values[index];
      if (nextStart === undefined) {
        continue;
      }
      const bounds = trimTriviaBounds(text, cursor, nextStart);
      const chunk = text.slice(bounds.start, bounds.end);
      if (isBalancedChunk(chunk)) {
        const nextCaptures = captureEllipsis(captures, token.index, chunk);
        const nested = matchTokens(
          text,
          tokens,
          tokenIndex + 1,
          nextStart,
          nextCaptures,
          sourceLexemes,
        );
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  const nextLiteral = findNextLiteral(tokens, tokenIndex + 1);
  if (!nextLiteral) {
    const bounds = trimTriviaBounds(text, cursor, text.length);
    const chunk = text.slice(bounds.start, bounds.end);
    if (!isBalancedChunk(chunk)) {
      return null;
    }

    const nextCaptures = captureHole(captures, token, chunk);
    if (!nextCaptures) {
      return null;
    }

    return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures, sourceLexemes);
  }

  if (!haveFutureLiteralCandidates(text, tokens, tokenIndex + 1, cursor, sourceLexemes)) {
    return null;
  }

  const nextStarts = findLiteralStarts(text, nextLiteral, cursor, sourceLexemes);
  for (let index = nextStarts.startIndex; index < nextStarts.values.length; index += 1) {
    const nextStart = nextStarts.values[index];
    if (nextStart === undefined) {
      continue;
    }
    const bounds = trimTriviaBounds(text, cursor, nextStart);
    const chunk = text.slice(bounds.start, bounds.end);
    if (isBalancedChunk(chunk)) {
      const nextCaptures = captureHole(captures, token, chunk);
      if (nextCaptures) {
        const nested = matchTokens(
          text,
          tokens,
          tokenIndex + 1,
          nextStart,
          nextCaptures,
          sourceLexemes,
        );
        if (nested) {
          return nested;
        }
      }
    }
  }

  return null;
}

function findNextLiteral(tokens: readonly TemplateToken[], fromIndex: number): TextToken | null {
  for (let index = fromIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token && token.kind === "text" && getLiteralLexemes(token).length > 0) {
      return token;
    }
  }

  return null;
}

function haveFutureLiteralCandidates(
  text: string,
  tokens: readonly TemplateToken[],
  fromIndex: number,
  cursor: number,
  sourceLexemes: SourceLexemes,
): boolean {
  for (let index = fromIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.kind !== "text" || getLiteralLexemes(token).length === 0) {
      continue;
    }
    const starts = findLiteralStarts(text, token, cursor, sourceLexemes);
    if (starts.startIndex >= starts.values.length) {
      return false;
    }
  }
  return true;
}

function captureHole(
  captures: ReadonlyMap<string, string>,
  hole: HoleToken,
  value: string,
): Map<string, string> | null {
  if (hole.constraintRegex && value.length > MAX_CONSTRAINED_CAPTURE_LENGTH) {
    return null;
  }
  if (hole.constraintRegex && !hole.constraintRegex.test(value)) {
    return null;
  }

  const next = new Map(captures);
  if (hole.anonymous) {
    return next;
  }

  const current = next.get(hole.name);
  if (current !== undefined && current !== value) {
    return null;
  }

  if (current === undefined) {
    next.set(hole.name, value);
  }

  return next;
}

function captureEllipsis(
  captures: ReadonlyMap<string, string>,
  index: number,
  value: string,
): Map<string, string> {
  const next = new Map(captures);
  next.set(`${ELLIPSIS_CAPTURE_PREFIX}${index}`, value);
  return next;
}

function findLiteralStarts(
  text: string,
  literal: TextToken,
  fromIndex: number,
  sourceLexemes: SourceLexemes,
): LiteralStarts {
  const lexemes = getLiteralLexemes(literal);
  const firstLexeme = lexemes[0];
  if (!firstLexeme) {
    return { values: [], startIndex: 0 };
  }

  let starts = sourceLexemes.literalStarts.get(literal);
  if (!starts) {
    const matches: number[] = [];
    for (const span of sourceLexemes.spans) {
      if (span.value !== firstLexeme) {
        continue;
      }
      if (matchTextToken(text, literal, span.start, false, sourceLexemes)) {
        matches.push(span.start);
      }
    }
    starts = matches;
    sourceLexemes.literalStarts.set(literal, starts);
  }

  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? Number.POSITIVE_INFINITY) < fromIndex) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return { values: starts, startIndex: low };
}

function matchTextToken(
  text: string,
  token: TextToken,
  cursor: number,
  allowLeadingTrivia: boolean,
  sourceLexemes: SourceLexemes,
): { end: number } | null {
  const lexemes = getLiteralLexemes(token);
  if (lexemes.length === 0) {
    const end = allowLeadingTrivia || token.hasTrailingTrivia ? skipTrivia(text, cursor) : cursor;
    return { end };
  }

  let probe = allowLeadingTrivia ? skipTrivia(text, cursor) : cursor;
  for (let index = 0; index < lexemes.length; index += 1) {
    const lexeme = lexemes[index];
    const sourceLexeme = sourceLexemes.byStart.get(probe);
    if (!lexeme || sourceLexeme?.value !== lexeme) {
      return null;
    }
    probe = sourceLexeme.end;
    if (index < lexemes.length - 1) {
      probe = skipTrivia(text, probe);
    }
  }

  if (token.hasTrailingTrivia) {
    probe = skipTrivia(text, probe);
  }

  return { end: probe };
}

function getLiteralLexemes(token: TextToken): readonly string[] {
  return token.lexemes ?? collectLiteralLexemes(token.value);
}
