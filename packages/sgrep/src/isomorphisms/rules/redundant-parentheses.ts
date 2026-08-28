import ts from "@typescript/typescript6";
import type { IsomorphismRule } from "../types.ts";

export const redundantParenthesesRule: IsomorphismRule = {
  id: "redundant-parentheses",
  description: "Add or remove extra parentheses around binary expressions.",
  apply: (context) => {
    const variants = new Set<string>();

    visitNode(context.ast, (node) => {
      if (ts.isBinaryExpression(node) && !ts.isParenthesizedExpression(node.parent)) {
        const start = node.getStart(context.ast);
        const end = node.end;
        const expressionText = context.source.slice(start, end);
        if (expressionText.length > 0) {
          const variant =
            context.source.slice(0, start) + `(${expressionText})` + context.source.slice(end);
          if (variant !== context.source) {
            variants.add(variant);
          }
        }
      }
    });

    return [...variants];
  },
};

function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => visitNode(child, visitor));
}
