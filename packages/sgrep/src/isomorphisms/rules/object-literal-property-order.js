import ts from "typescript";
export const objectLiteralPropertyOrderRule = {
    id: "object-literal-property-order",
    description: "Swap adjacent object literal entries where key/value order is semantically irrelevant.",
    apply: (context) => {
        const variants = new Set();
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
                const swappedSegment = context.source.slice(rightStart, rightEnd) +
                    separator +
                    context.source.slice(leftStart, leftEnd);
                const variant = context.source.slice(0, leftStart) +
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
function isReorderableMapObject(properties) {
    const seenKeys = new Set();
    for (const property of properties) {
        if (!ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property)) {
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
function getStablePropertyKey(name) {
    if (ts.isIdentifier(name)) {
        return name.text;
    }
    if (ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name)) {
        return name.text;
    }
    return null;
}
function visitNode(node, visitor) {
    visitor(node);
    ts.forEachChild(node, (child) => visitNode(child, visitor));
}
