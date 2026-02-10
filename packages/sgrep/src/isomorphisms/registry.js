import { commutativeBinaryRule } from "./rules/commutative-binary.js";
import { objectLiteralPropertyOrderRule } from "./rules/object-literal-property-order.js";
import { redundantParenthesesRule } from "./rules/redundant-parentheses.js";
export const DEFAULT_ISOMORPHISM_RULES = [
    commutativeBinaryRule,
    objectLiteralPropertyOrderRule,
    redundantParenthesesRule,
];
