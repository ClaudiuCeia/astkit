import { tokenizeTemplate } from "./syntax.ts";
import type { CompiledReplacementTemplate } from "./types.ts";
import { ELLIPSIS_CAPTURE_PREFIX } from "./types.ts";

export function renderTemplate(
  source: string,
  captures: Record<string, string>,
): string {
  const template = compileReplacementTemplate(source);
  return renderCompiledTemplate(template, captures);
}

export function compileReplacementTemplate(
  source: string,
): CompiledReplacementTemplate {
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

  return rendered;
}
