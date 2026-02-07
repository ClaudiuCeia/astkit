const HOLE_PATTERN = /:\[([A-Za-z_][A-Za-z0-9_]*|_)\]/g;

type TextToken = {
  kind: "text";
  value: string;
};

type HoleToken = {
  kind: "hole";
  name: string;
  anonymous: boolean;
};

type TemplateToken = TextToken | HoleToken;

export type CompiledTemplate = {
  source: string;
  tokens: TemplateToken[];
};

export type TemplateMatch = {
  start: number;
  end: number;
  text: string;
  captures: Record<string, string>;
};

type MatchResult = {
  end: number;
  captures: Map<string, string>;
};

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

export function findTemplateMatches(
  text: string,
  template: CompiledTemplate,
): TemplateMatch[] {
  const matches: TemplateMatch[] = [];
  const firstToken = template.tokens[0];
  const anchored = firstToken?.kind === "text";
  const anchor = anchored ? firstToken.value : null;
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

export function renderTemplate(
  source: string,
  captures: Record<string, string>,
): string {
  return source.replace(
    HOLE_PATTERN,
    (_fullMatch: string, rawName: string): string => {
      if (rawName === "_") {
        return "";
      }

      const value = captures[rawName];
      if (value === undefined) {
        throw new Error(`Replacement uses unknown hole "${rawName}".`);
      }

      return value;
    },
  );
}

function tokenizeTemplate(source: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(HOLE_PATTERN)) {
    const index = match.index ?? 0;
    const literal = source.slice(lastIndex, index);
    if (literal.length > 0) {
      tokens.push({ kind: "text", value: literal });
    }

    const name = match[1];
    if (!name) {
      throw new Error("Invalid hole token.");
    }

    tokens.push({ kind: "hole", name, anonymous: name === "_" });
    lastIndex = index + match[0].length;
  }

  const tail = source.slice(lastIndex);
  if (tail.length > 0) {
    tokens.push({ kind: "text", value: tail });
  }

  return tokens;
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
  const next = new Map(captures);
  if (hole.anonymous) {
    return next;
  }

  const current = next.get(hole.name);
  if (current !== undefined && current !== value) {
    return null;
  }

  next.set(hole.name, value);
  return next;
}

function isBalancedChunk(chunk: string): boolean {
  const closingStack: string[] = [];
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let index = 0; index < chunk.length; index += 1) {
    const character = chunk[index];
    if (!character) {
      break;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }

    if (character === "(") {
      closingStack.push(")");
      continue;
    }

    if (character === "[") {
      closingStack.push("]");
      continue;
    }

    if (character === "{") {
      closingStack.push("}");
      continue;
    }

    if (character === ")" || character === "]" || character === "}") {
      const expected = closingStack.pop();
      if (expected !== character) {
        return false;
      }
    }
  }

  return quote === null && closingStack.length === 0;
}
