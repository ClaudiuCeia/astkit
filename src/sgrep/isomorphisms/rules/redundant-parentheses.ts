import ts from "typescript";
import type { IsomorphismRule } from "../types.ts";

export const redundantParenthesesRule: IsomorphismRule = {
  id: "redundant-parentheses",
  description: "Add or remove extra parentheses around binary expressions.",
  apply: (context) => {
    const variants = new Set<string>();

    visitNode(context.ast, (node) => {
      if (ts.isParenthesizedExpression(node)) {
        const start = node.getStart(context.ast);
        const end = node.end;
        const innerStart = node.expression.getStart(context.ast);
        const innerEnd = node.expression.end;
        const innerText = context.source.slice(innerStart, innerEnd);
        if (innerText.length > 0) {
          const variant =
            context.source.slice(0, start) +
            innerText +
            context.source.slice(end);
          if (variant !== context.source) {
            variants.add(variant);
          }
        }
      }

      if (ts.isBinaryExpression(node)) {
        const start = node.getStart(context.ast);
        const end = node.end;
        const expressionText = context.source.slice(start, end);
        if (expressionText.length > 0) {
          const variant =
            context.source.slice(0, start) +
            `(${expressionText})` +
            context.source.slice(end);
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
