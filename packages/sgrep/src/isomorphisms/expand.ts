import { DEFAULT_ISOMORPHISM_RULES } from "./registry.ts";
import { parseTemplateIsomorphismContext } from "./template-ast.ts";
import type { ExpandIsomorphismsOptions } from "./types.ts";

const DEFAULT_MAX_ISOMORPHISM_VARIANTS = 24;

type Variant = {
  pattern: string;
};

/** Expands a pattern with configured isomorphism rules, deduplicated and bounded. */
export function expandPatternIsomorphisms(
  pattern: string,
  options: ExpandIsomorphismsOptions = {},
): string[] {
  if (!(options.enabled ?? true)) {
    return [pattern];
  }

  const rules = options.rules ?? DEFAULT_ISOMORPHISM_RULES;
  if (rules.length === 0) {
    return [pattern];
  }

  const maxVariants = normalizeMaxVariants(options.maxVariants);
  const variants: Variant[] = [{ pattern }];
  const seenPatterns = new Set<string>([pattern]);

  for (
    let variantIndex = 0;
    variantIndex < variants.length && variants.length < maxVariants;
    variantIndex += 1
  ) {
    const current = variants[variantIndex];
    if (!current) {
      continue;
    }

    const context = parseTemplateIsomorphismContext(current.pattern);
    if (!context) {
      continue;
    }

    for (const rule of rules) {
      const produced = rule.apply(context);
      for (const nextPattern of produced) {
        if (seenPatterns.has(nextPattern)) {
          continue;
        }

        seenPatterns.add(nextPattern);
        variants.push({
          pattern: nextPattern,
        });
        if (variants.length >= maxVariants) {
          break;
        }
      }

      if (variants.length >= maxVariants) {
        break;
      }
    }
  }

  return variants.map((variant) => variant.pattern);
}

function normalizeMaxVariants(maxVariants: number | undefined): number {
  if (maxVariants === undefined) {
    return DEFAULT_MAX_ISOMORPHISM_VARIANTS;
  }

  return Math.max(1, Math.floor(maxVariants));
}
