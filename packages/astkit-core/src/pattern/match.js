import { isBalancedChunk } from "./balance.js";
import { ELLIPSIS_CAPTURE_PREFIX } from "./types.js";
export function findTemplateMatches(text, template) {
    const matches = [];
    const firstToken = template.tokens[0];
    const anchor = firstToken?.kind === "text" ? firstToken.value : null;
    let cursor = 0;
    while (cursor <= text.length) {
        const start = anchor ? text.indexOf(anchor, cursor) : cursor;
        if (start < 0) {
            break;
        }
        const result = matchTokens(text, template.tokens, 0, start, new Map());
        if (!result || result.end <= start) {
            cursor = start + 1;
            continue;
        }
        matches.push({
            start,
            end: result.end,
            text: text.slice(start, result.end),
            captures: Object.fromEntries(result.captures),
        });
        cursor = result.end;
    }
    return matches;
}
function matchTokens(text, tokens, tokenIndex, cursor, captures) {
    const token = tokens[tokenIndex];
    if (!token) {
        return { end: cursor, captures: new Map(captures) };
    }
    if (token.kind === "text") {
        if (!text.startsWith(token.value, cursor)) {
            return null;
        }
        return matchTokens(text, tokens, tokenIndex + 1, cursor + token.value.length, captures);
    }
    if (token.kind === "ellipsis") {
        const nextLiteral = findNextLiteral(tokens, tokenIndex + 1);
        if (!nextLiteral) {
            const chunk = text.slice(cursor);
            if (!isBalancedChunk(chunk)) {
                return null;
            }
            const nextCaptures = captureEllipsis(captures, token.index, chunk);
            return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures);
        }
        const nextIndexes = findLiteralIndexes(text, nextLiteral.value, cursor);
        for (let index = nextIndexes.length - 1; index >= 0; index -= 1) {
            const nextIndex = nextIndexes[index];
            if (nextIndex === undefined) {
                continue;
            }
            const chunk = text.slice(cursor, nextIndex);
            if (isBalancedChunk(chunk)) {
                const nextCaptures = captureEllipsis(captures, token.index, chunk);
                const nested = matchTokens(text, tokens, tokenIndex + 1, nextIndex, nextCaptures);
                if (nested) {
                    return nested;
                }
            }
        }
        return null;
    }
    const nextLiteral = findNextLiteral(tokens, tokenIndex + 1);
    if (!nextLiteral) {
        const chunk = text.slice(cursor);
        if (!isBalancedChunk(chunk)) {
            return null;
        }
        const nextCaptures = captureHole(captures, token, chunk);
        if (!nextCaptures) {
            return null;
        }
        return matchTokens(text, tokens, tokenIndex + 1, text.length, nextCaptures);
    }
    let probe = cursor;
    while (probe <= text.length) {
        const nextIndex = text.indexOf(nextLiteral.value, probe);
        if (nextIndex < 0) {
            return null;
        }
        const chunk = text.slice(cursor, nextIndex);
        if (isBalancedChunk(chunk)) {
            const nextCaptures = captureHole(captures, token, chunk);
            if (nextCaptures) {
                const nested = matchTokens(text, tokens, tokenIndex + 1, nextIndex, nextCaptures);
                if (nested) {
                    return nested;
                }
            }
        }
        probe = nextIndex + 1;
    }
    return null;
}
function findNextLiteral(tokens, fromIndex) {
    for (let index = fromIndex; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token && token.kind === "text") {
            return token;
        }
    }
    return null;
}
function captureHole(captures, hole, value) {
    if (hole.constraintRegex && !hole.constraintRegex.test(value)) {
        return null;
    }
    const next = new Map(captures);
    if (hole.anonymous) {
        return next;
    }
    const current = next.get(hole.name);
    if (current !== undefined && current !== value) {
        return null;
    }
    if (current === undefined) {
        next.set(hole.name, value);
    }
    return next;
}
function captureEllipsis(captures, index, value) {
    const next = new Map(captures);
    next.set(`${ELLIPSIS_CAPTURE_PREFIX}${index}`, value);
    return next;
}
function findLiteralIndexes(text, literal, fromIndex) {
    const indexes = [];
    let probe = fromIndex;
    while (probe <= text.length) {
        const matchIndex = text.indexOf(literal, probe);
        if (matchIndex < 0) {
            break;
        }
        indexes.push(matchIndex);
        probe = matchIndex + 1;
    }
    return indexes;
}
