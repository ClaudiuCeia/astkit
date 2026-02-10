import { DEFAULT_ISOMORPHISM_RULES } from "./registry.js";
import { parseTemplateIsomorphismContext } from "./template-ast.js";
const DEFAULT_MAX_ISOMORPHISM_VARIANTS = 24;
export function expandPatternIsomorphisms(pattern, options = {}) {
    if (!(options.enabled ?? true)) {
        return [pattern];
    }
    const rules = options.rules ?? DEFAULT_ISOMORPHISM_RULES;
    if (rules.length === 0) {
        return [pattern];
    }
    const maxVariants = normalizeMaxVariants(options.maxVariants);
    const variants = [{ pattern, applied: [] }];
    const seenPatterns = new Set([pattern]);
    for (let variantIndex = 0; variantIndex < variants.length && variants.length < maxVariants; variantIndex += 1) {
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
                    applied: [...current.applied, rule.id],
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
function normalizeMaxVariants(maxVariants) {
    if (maxVariants === undefined) {
        return DEFAULT_MAX_ISOMORPHISM_VARIANTS;
    }
    return Math.max(1, Math.floor(maxVariants));
}
