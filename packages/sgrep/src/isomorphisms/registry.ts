import { commutativeBinaryRule } from "./rules/commutative-binary.ts";
import { objectLiteralPropertyOrderRule } from "./rules/object-literal-property-order.ts";
import { redundantParenthesesRule } from "./rules/redundant-parentheses.ts";
import type { IsomorphismRule } from "./types.ts";

export const DEFAULT_ISOMORPHISM_RULES: readonly IsomorphismRule[] = [
  commutativeBinaryRule,
  objectLiteralPropertyOrderRule,
  redundantParenthesesRule,
];
