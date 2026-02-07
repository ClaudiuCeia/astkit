import { isBalancedChunk } from "./balance.ts";
import type {
  CompiledTemplate,
  HoleToken,
  TemplateMatch,
  TemplateToken,
  TextToken,
} from "./types.ts";

type MatchResult = {
  end: number;
  captures: Map<string, string>;
};

export function findTemplateMatches(
  text: string,
  template: CompiledTemplate,
): TemplateMatch[] {
  const matches: TemplateMatch[] = [];
  const firstToken = template.tokens[0];
  const anchor = firstToken?.kind === "text" ? firstToken.value : null;
  let cursor = 0;

  while (cursor <= text.length) {
    const start = anchor ? text.indexOf(anchor, cursor) : cursor;
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
    if (!text.startsWith(token.value, cursor)) {
      return null;
    }

    return matchTokens(
      text,
      tokens,
      tokenIndex + 1,
      cursor + token.value.length,
      captures,
    );
  }

  const nextLiteral = findNextLiteral(tokens, tokenIndex + 1);
  if (!nextLiteral) {
    const chunk = text.slice(cursor);
    if (!isBalancedChunk(chunk)) {
      return null;
    }

    const nextCaptures = captureHole(captures, token, chunk);
    if (!nextCaptures) {
      return null;
    }

    return matchTokens(
      text,
      tokens,
      tokenIndex + 1,
      text.length,
      nextCaptures,
    );
  }

  let probe = cursor;
  while (probe <= text.length) {
    const nextIndex = text.indexOf(nextLiteral.value, probe);
    if (nextIndex < 0) {
      return null;
    }

    const chunk = text.slice(cursor, nextIndex);
    if (isBalancedChunk(chunk)) {
      const nextCaptures = captureHole(captures, token, chunk);
      if (nextCaptures) {
        const nested = matchTokens(
          text,
          tokens,
          tokenIndex + 1,
          nextIndex,
          nextCaptures,
        );
        if (nested) {
          return nested;
        }
      }
    }

    probe = nextIndex + 1;
  }

  return null;
}

function findNextLiteral(
  tokens: readonly TemplateToken[],
  fromIndex: number,
): TextToken | null {
  for (let index = fromIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token && token.kind === "text") {
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
