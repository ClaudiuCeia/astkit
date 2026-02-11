import { isBalancedChunk } from "./balance.ts";
import { collectLiteralLexemes, skipTrivia, trimTriviaBounds } from "./lexemes.ts";
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

const MAX_CONSTRAINED_CAPTURE_LENGTH = 2048;

export function findTemplateMatches(text: string, template: CompiledTemplate): TemplateMatch[] {
  const matches: TemplateMatch[] = [];
  const firstToken = template.tokens[0];
  const anchor = firstToken?.kind === "text" ? (getLiteralLexemes(firstToken)[0] ?? null) : null;
  let cursor = 0;

  while (cursor <= text.length) {
    const start = anchor ? text.indexOf(anchor, cursor) : skipTrivia(text, cursor);
    if (start < 0) {
      break;
    }

    const result = matchTokens(text, template.tokens, 0, start, new Map());
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
): MatchResult | null {
  const token = tokens[tokenIndex];
  if (!token) {
    return { end: cursor, captures: new Map(captures) };
  }

  if (token.kind === "text") {
    const matched = matchTextToken(text, token, cursor, true);
    if (!matched) {
      return null;
    }

    return matchTokens(text, tokens, tokenIndex + 1, matched.end, captures);
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
      return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures);
    }

    const nextStarts = findLiteralStarts(text, nextLiteral, cursor);
    for (let index = nextStarts.length - 1; index >= 0; index -= 1) {
      const nextStart = nextStarts[index];
      if (nextStart === undefined) {
        continue;
      }
      const bounds = trimTriviaBounds(text, cursor, nextStart);
      const chunk = text.slice(bounds.start, bounds.end);
      if (isBalancedChunk(chunk)) {
        const nextCaptures = captureEllipsis(captures, token.index, chunk);
        const nested = matchTokens(text, tokens, tokenIndex + 1, nextStart, nextCaptures);
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

    return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures);
  }

  const nextStarts = findLiteralStarts(text, nextLiteral, cursor);
  for (const nextStart of nextStarts) {
    const bounds = trimTriviaBounds(text, cursor, nextStart);
    const chunk = text.slice(bounds.start, bounds.end);
    if (isBalancedChunk(chunk)) {
      const nextCaptures = captureHole(captures, token, chunk);
      if (nextCaptures) {
        const nested = matchTokens(text, tokens, tokenIndex + 1, nextStart, nextCaptures);
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

function findLiteralStarts(text: string, literal: TextToken, fromIndex: number): number[] {
  const starts: number[] = [];
  const lexemes = getLiteralLexemes(literal);
  const firstLexeme = lexemes[0];
  if (!firstLexeme) {
    return starts;
  }

  let probe = fromIndex;
  while (probe <= text.length) {
    const start = text.indexOf(firstLexeme, probe);
    if (start < 0) {
      break;
    }
    if (matchTextToken(text, literal, start, false)) {
      starts.push(start);
    }
    probe = start + 1;
  }

  return starts;
}

function matchTextToken(
  text: string,
  token: TextToken,
  cursor: number,
  allowLeadingTrivia: boolean,
): { end: number } | null {
  const lexemes = getLiteralLexemes(token);
  if (lexemes.length === 0) {
    const end = allowLeadingTrivia || token.hasTrailingTrivia ? skipTrivia(text, cursor) : cursor;
    return { end };
  }

  let probe = allowLeadingTrivia ? skipTrivia(text, cursor) : cursor;
  for (let index = 0; index < lexemes.length; index += 1) {
    const lexeme = lexemes[index];
    if (!lexeme || !text.startsWith(lexeme, probe)) {
      return null;
    }
    probe += lexeme.length;
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
