import type ts from "typescript";

/** Parsed template source and AST available to isomorphism rules. */
export type IsomorphismContext = {
  source: string;
  ast: ts.SourceFile;
};

/** Rule contract for producing additional semantically-equivalent patterns. */
export type IsomorphismRule = {
  /** Stable rule id used in diagnostics/tests. */
  id: string;
  /** Human-readable rule summary. */
  description: string;
  /** Returns zero or more expanded pattern variants. */
  apply: (context: IsomorphismContext) => string[];
};

/** Controls behavior of `expandPatternIsomorphisms`. */
export type ExpandIsomorphismsOptions = {
  /** Global on/off switch for expansion (defaults to `true`). */
  enabled?: boolean;
  /** Maximum number of variants returned including the original pattern. */
  maxVariants?: number;
  /** Rule set used during expansion (defaults to built-ins). */
  rules?: readonly IsomorphismRule[];
};
