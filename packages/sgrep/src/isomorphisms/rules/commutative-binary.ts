import ts from "typescript";
import type { IsomorphismRule } from "../types.ts";

const COMMUTATIVE_OPERATOR_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.AmpersandToken,
  ts.SyntaxKind.BarToken,
  ts.SyntaxKind.CaretToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

export const commutativeBinaryRule: IsomorphismRule = {
  id: "commutative-binary",
  description: "Swap operands of commutative binary operators.",
  apply: (context) => {
    const variants = new Set<string>();

    visitNode(context.ast, (node) => {
      if (!ts.isBinaryExpression(node)) {
        return;
      }
      if (!COMMUTATIVE_OPERATOR_KINDS.has(node.operatorToken.kind)) {
        return;
      }

      const expressionStart = node.getStart(context.ast);
      const expressionEnd = node.end;
      const leftStart = node.left.getStart(context.ast);
      const leftEnd = node.left.end;
      const rightStart = node.right.getStart(context.ast);
      const rightEnd = node.right.end;

      const leftText = context.source.slice(leftStart, leftEnd);
      const middleText = context.source.slice(leftEnd, rightStart);
      const rightText = context.source.slice(rightStart, rightEnd);
      if (leftText.length === 0 || middleText.length === 0 || rightText.length === 0) {
        return;
      }

      const swappedExpression = `${rightText}${middleText}${leftText}`;
      const variant =
        context.source.slice(0, expressionStart) +
        swappedExpression +
        context.source.slice(expressionEnd);
      if (variant !== context.source) {
        variants.add(variant);
      }
    });

    return [...variants];
  },
};

function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => visitNode(child, visitor));
}
