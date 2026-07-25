import { analyzeLexemeLayout } from "./lexemes.ts";
import { tokenizeTemplate } from "./syntax.ts";
import type { CompiledReplacementTemplate, CompiledTemplate } from "./types.ts";
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

export function validateReplacementTemplate(
  pattern: CompiledTemplate,
  replacement: CompiledReplacementTemplate,
): void {
  const holeNames = new Set<string>();
  for (const token of pattern.tokens) {
    if (token.kind === "hole" && !token.anonymous) {
      holeNames.add(token.name);
    }
  }
  const ellipsisIndexes = new Set(
    pattern.tokens.filter((token) => token.kind === "ellipsis").map((token) => token.index),
  );

  for (const token of replacement.tokens) {
    if (token.kind === "hole" && !token.anonymous && !holeNames.has(token.name)) {
      throw new Error(`Replacement uses unknown hole "${token.name}".`);
    }
    if (token.kind === "ellipsis" && !ellipsisIndexes.has(token.index)) {
      throw new Error(
        `Replacement uses ellipsis #${token.index + 1} but pattern did not capture it.`,
      );
    }
  }
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
      const captureName = `${ELLIPSIS_CAPTURE_PREFIX}${token.index}`;
      if (!Object.hasOwn(captures, captureName)) {
        throw new Error(
          `Replacement uses ellipsis #${token.index + 1} but pattern did not capture it.`,
        );
      }
      rendered += captures[captureName];
      continue;
    }

    if (token.anonymous) {
      continue;
    }

    if (!Object.hasOwn(captures, token.name)) {
      throw new Error(`Replacement uses unknown hole "${token.name}".`);
    }

    rendered += captures[token.name];
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
      const sourceTrivia = sourceLayout.separators[index] ?? "";
      const renderedTrivia = renderedLayout.separators[index] ?? "";
      const boundaryTrivia = sourceTrivia.length === 0 ? renderedTrivia : sourceTrivia;
      parts.push(boundaryTrivia);
    }
  }
  parts.push(sourceLayout.trailingTrivia);

  return parts.join("");
}
