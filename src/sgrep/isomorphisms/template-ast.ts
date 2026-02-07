import ts from "typescript";
import { tokenizeTemplate } from "../../pattern/index.ts";
import type { TemplateToken } from "../../pattern/types.ts";
import type { IsomorphismContext } from "./types.ts";

export function parseTemplateIsomorphismContext(
  source: string,
): IsomorphismContext | null {
  let tokens: TemplateToken[];
  try {
    tokens = tokenizeTemplate(source);
  } catch {
    return null;
  }

  if (tokens.some((token) => token.kind === "ellipsis")) {
    // The template ellipsis token ("...") is a matcher wildcard, not JS spread syntax.
    // Skip AST-based isomorphisms for now to avoid ambiguous rewrites.
    return null;
  }

  const canonicalSource = tokens.map(renderTemplateToken).join("");
  if (canonicalSource !== source) {
    return null;
  }

  const sanitizedSource = tokens
    .map((token, index) => {
      if (token.kind === "text") {
        return token.value;
      }

      const rawToken = renderTemplateToken(token);
      return buildIdentifierPlaceholder(rawToken.length, index);
    })
    .join("");

  if (sanitizedSource.length !== source.length) {
    return null;
  }

  const ast = ts.createSourceFile(
    "sgrep-pattern.ts",
    sanitizedSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return { source, ast };
}

function renderTemplateToken(token: TemplateToken): string {
  if (token.kind === "text") {
    return token.value;
  }

  if (token.kind === "ellipsis") {
    return "...";
  }

  if (token.constraintSource === null) {
    return `:[${token.name}]`;
  }

  return `:[${token.name}~${token.constraintSource}]`;
}

function buildIdentifierPlaceholder(length: number, index: number): string {
  if (length <= 0) {
    return "";
  }

  if (length === 1) {
    return "_";
  }

  const base = `_${index.toString(36)}_`;
  if (base.length >= length) {
    return `_`.repeat(length);
  }

  return `${base}${"_".repeat(length - base.length)}`;
}
