type Mode =
  | "normal"
  | "single"
  | "double"
  | "template"
  | "regex"
  | "line-comment"
  | "block-comment";

type Delim = "(" | "[" | "{";

type StackEntry = {
  delim: Delim;
  // Marks a `{` that started a template expression (`${ ... }`) so we can
  // return back into template literal mode when it closes.
  templateExpr: boolean;
};

function isOpening(ch: string): ch is Delim {
  return ch === "(" || ch === "[" || ch === "{";
}

function matchingOpen(close: string): Delim | null {
  if (close === ")") return "(";
  if (close === "]") return "[";
  if (close === "}") return "{";
  return null;
}

// Fast structural-balance check used by the template matcher.
// Needs to be permissive for JS/TS fragments: ignore delimiters inside strings
// and comments; handle template literals with `${...}` expressions.
export function isBalancedChunk(chunk: string): boolean {
  let mode: Mode = "normal";
  let regexCharacterClass = false;
  const stack: StackEntry[] = [];

  for (let i = 0; i < chunk.length; i += 1) {
    const ch = chunk[i] ?? "";
    const next = i + 1 < chunk.length ? chunk[i + 1] : "";

    if (mode === "line-comment") {
      if (ch === "\n") {
        mode = "normal";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        mode = "normal";
        i += 1;
      }
      continue;
    }

    if (mode === "single") {
      if (ch === "\\") {
        i += 1; // skip escaped char
        continue;
      }
      if (ch === "'") {
        mode = "normal";
      }
      continue;
    }

    if (mode === "double") {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') {
        mode = "normal";
      }
      continue;
    }

    if (mode === "template") {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "`") {
        mode = "normal";
        continue;
      }
      if (ch === "$" && next === "{") {
        stack.push({ delim: "{", templateExpr: true });
        mode = "normal";
        i += 1;
      }
      continue;
    }

    if (mode === "regex") {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029") {
        return false;
      }
      if (ch === "[") {
        regexCharacterClass = true;
        continue;
      }
      if (ch === "]" && regexCharacterClass) {
        regexCharacterClass = false;
        continue;
      }
      if (ch === "/" && !regexCharacterClass) {
        mode = "normal";
        while (i + 1 < chunk.length && /[A-Za-z]/u.test(chunk[i + 1] ?? "")) {
          i += 1;
        }
      }
      continue;
    }

    // mode === "normal"
    if (ch === "/" && next === "/") {
      mode = "line-comment";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      mode = "block-comment";
      i += 1;
      continue;
    }
    if (ch === "/" && isRegexLiteralStart(chunk, i)) {
      mode = "regex";
      regexCharacterClass = false;
      continue;
    }

    if (ch === "'") {
      mode = "single";
      continue;
    }
    if (ch === '"') {
      mode = "double";
      continue;
    }
    if (ch === "`") {
      mode = "template";
      continue;
    }

    if (isOpening(ch)) {
      stack.push({ delim: ch, templateExpr: false });
      continue;
    }

    const open = matchingOpen(ch);
    if (!open) {
      continue;
    }

    const top = stack.pop();
    if (!top || top.delim !== open) {
      return false;
    }
    if (ch === "}" && top.templateExpr) {
      // End of `${ ... }` in a template literal.
      mode = "template";
    }
  }

  return mode === "normal" && stack.length === 0;
}

function isRegexLiteralStart(source: string, slashIndex: number): boolean {
  let previousIndex = slashIndex - 1;
  while (previousIndex >= 0 && /\s/u.test(source[previousIndex] ?? "")) {
    previousIndex -= 1;
  }
  if (previousIndex < 0) {
    return true;
  }

  const previous = source[previousIndex] ?? "";
  if (/[[({:,;=!?&|+\-*%^~<>/]/u.test(previous)) {
    return true;
  }
  if (!/[A-Za-z0-9_$]/u.test(previous)) {
    return false;
  }

  let wordStart = previousIndex;
  while (wordStart > 0 && /[A-Za-z0-9_$]/u.test(source[wordStart - 1] ?? "")) {
    wordStart -= 1;
  }
  const previousWord = source.slice(wordStart, previousIndex + 1);
  return /^(?:await|case|delete|in|instanceof|new|of|return|throw|typeof|void|yield)$/u.test(
    previousWord,
  );
}
