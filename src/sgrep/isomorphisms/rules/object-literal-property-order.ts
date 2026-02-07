import ts from "typescript";
import type { IsomorphismRule } from "../types.ts";

export const objectLiteralPropertyOrderRule: IsomorphismRule = {
  id: "object-literal-property-order",
  description:
    "Swap adjacent object literal entries where key/value order is semantically irrelevant.",
  apply: (context) => {
    const variants = new Set<string>();

    visitNode(context.ast, (node) => {
      if (!ts.isObjectLiteralExpression(node)) {
        return;
      }

      const properties = [...node.properties];
      if (properties.length < 2) {
        return;
      }

      if (!isReorderableMapObject(properties)) {
        return;
      }

      for (let index = 0; index < properties.length - 1; index += 1) {
        const left = properties[index];
        const right = properties[index + 1];
        if (!left || !right) {
          continue;
        }

        const leftStart = left.getStart(context.ast);
        const leftEnd = left.end;
        const rightStart = right.getStart(context.ast);
        const rightEnd = right.end;

        if (leftEnd > rightStart) {
          continue;
        }

        const separator = context.source.slice(leftEnd, rightStart);
        if (!separator.includes(",")) {
          continue;
        }

        const swappedSegment =
          context.source.slice(rightStart, rightEnd) +
          separator +
          context.source.slice(leftStart, leftEnd);
        const variant =
          context.source.slice(0, leftStart) +
          swappedSegment +
          context.source.slice(rightEnd);
        if (variant !== context.source) {
          variants.add(variant);
        }
      }
    });

    return [...variants];
  },
};

function isReorderableMapObject(
  properties: readonly ts.ObjectLiteralElementLike[],
): boolean {
  const seenKeys = new Set<string>();

  for (const property of properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      return false;
    }

    const key = getStablePropertyKey(property.name);
    if (key === null) {
      return false;
    }
    if (seenKeys.has(key)) {
      // Duplicate keys are order-sensitive ("last write wins").
      return false;
    }
    seenKeys.add(key);
  }

  return true;
}

function getStablePropertyKey(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  return null;
}

function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => visitNode(child, visitor));
}
