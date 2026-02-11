import { analyzeLexemeLayout } from "./lexemes.ts";
import { tokenizeTemplate } from "./syntax.ts";
import type { CompiledReplacementTemplate } from "./types.ts";
import { ELLIPSIS_CAPTURE_PREFIX } from "./types.ts";

export type RenderTemplateOptions = {
  preserveLayoutFrom?: string;
};

export function renderTemplate(
  source: string,
  captures: Record<string, string>,
  options: RenderTemplateOptions = {},
): string {
  const template = compileReplacementTemplate(source);
  return renderCompiledTemplate(template, captures, options);
}

export function compileReplacementTemplate(source: string): CompiledReplacementTemplate {
  if (source.length === 0) {
    return {
      source,
      tokens: [],
    };
  }

  return {
    source,
    tokens: tokenizeTemplate(source),
  };
}

export function renderCompiledTemplate(
  template: CompiledReplacementTemplate,
  captures: Record<string, string>,
  options: RenderTemplateOptions = {},
): string {
  const tokens = template.tokens;
  let rendered = "";

  for (const token of tokens) {
    if (token.kind === "text") {
      rendered += token.value;
      continue;
    }

    if (token.kind === "ellipsis") {
      const value = captures[`${ELLIPSIS_CAPTURE_PREFIX}${token.index}`];
      if (value === undefined) {
        throw new Error(
          `Replacement uses ellipsis #${token.index + 1} but pattern did not capture it.`,
        );
      }
      rendered += value;
      continue;
    }

    if (token.anonymous) {
      continue;
    }

    const value = captures[token.name];
    if (value === undefined) {
      throw new Error(`Replacement uses unknown hole "${token.name}".`);
    }

    rendered += value;
  }

  if (!options.preserveLayoutFrom) {
    return rendered;
  }

  return preserveTriviaLayout(options.preserveLayoutFrom, rendered);
}

function preserveTriviaLayout(source: string, rendered: string): string {
  const sourceLayout = analyzeLexemeLayout(source);
  const renderedLayout = analyzeLexemeLayout(rendered);
  if (!sourceLayout || !renderedLayout) {
    return rendered;
  }
  if (sourceLayout.lexemes.length === 0 || renderedLayout.lexemes.length === 0) {
    return rendered;
  }

  if (
    sourceLayout.lexemes.length === renderedLayout.lexemes.length &&
    sourceLayout.lexemes.every((lexeme, index) => lexeme === renderedLayout.lexemes[index])
  ) {
    return source;
  }

  if (sourceLayout.lexemes.length !== renderedLayout.lexemes.length) {
    return rendered;
  }

  const parts: string[] = [sourceLayout.leadingTrivia];
  for (let index = 0; index < renderedLayout.lexemes.length; index += 1) {
    const lexeme = renderedLayout.lexemes[index];
    if (!lexeme) {
      continue;
    }
    parts.push(lexeme);
    if (index < renderedLayout.lexemes.length - 1) {
      const boundaryTrivia =
        sourceLayout.separators[index] ?? renderedLayout.separators[index] ?? "";
      parts.push(boundaryTrivia);
    }
  }
  parts.push(sourceLayout.trailingTrivia);

  return parts.join("");
}
