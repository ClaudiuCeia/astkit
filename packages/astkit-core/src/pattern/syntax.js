import { any, anyChar, cut, eof, formatErrorReport, many, many1, map, mapJoin, minus, optional, regex as parseRegex, seq, str, } from "@claudiu-ceia/combine";
const HOLE_INNER_NAME_PATTERN = /(?:[A-Za-z_][A-Za-z0-9_]*|_)/;
const holeNameParser = parseRegex(HOLE_INNER_NAME_PATTERN, "hole name");
const escapedConstraintCharacterParser = map(seq(str("\\"), anyChar()), ([slash, character]) => `${slash}${character}`);
const charClassCharacterParser = any(escapedConstraintCharacterParser, parseRegex(/[^\]]/, "character class character"));
const charClassParser = map(seq(str("["), mapJoin(many(charClassCharacterParser)), str("]")), ([open, body, close]) => `${open}${body}${close}`);
const regexConstraintCharacterParser = any(escapedConstraintCharacterParser, charClassParser, parseRegex(/[^\]]/, "regex constraint character"));
const regexConstraintParser = mapJoin(many1(regexConstraintCharacterParser));
const holeTokenParser = map(seq(str(":["), cut(holeNameParser, "hole name"), optional(seq(str("~"), cut(regexConstraintParser, "regex constraint"))), cut(str("]"), "closing ']'")), ([, name, constraint]) => {
    const constraintSource = constraint ? constraint[1] : null;
    return {
        kind: "hole",
        name,
        anonymous: name === "_",
        constraintSource,
    };
});
const ellipsisTokenParser = map(str("..."), () => ({
    kind: "ellipsis",
}));
const escapedTextTokenParser = map(seq(str("\\"), any(str("..."), str(":["), anyChar())), ([, value]) => ({ kind: "text", value }));
const textTokenParser = map(mapJoin(many1(minus(anyChar(), any(str("..."), str(":["), str("\\"))))), (value) => ({ kind: "text", value }));
const templateTokensParser = map(seq(many(any(holeTokenParser, ellipsisTokenParser, escapedTextTokenParser, textTokenParser)), eof()), ([tokens]) => tokens);
export function tokenizeTemplate(source) {
    const parsed = templateTokensParser({ text: source, index: 0 });
    if (!parsed.success) {
        const base = formatErrorReport(parsed, {
            color: false,
            contextLines: 0,
            stack: false,
        });
        const hint = buildTemplateParseHint(source, base);
        throw new Error(hint.length > 0 ? `Invalid template:\n${base}\nHint: ${hint}` : `Invalid template:\n${base}`);
    }
    let ellipsisIndex = 0;
    return parsed.value.map((token) => resolveRawToken(token, () => ellipsisIndex++));
}
export function compileTemplate(source) {
    if (source.length === 0) {
        throw new Error("Template cannot be empty.");
    }
    const tokens = tokenizeTemplate(source);
    if (tokens.length === 0) {
        throw new Error("Template did not produce any tokens.");
    }
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const current = tokens[index];
        const next = tokens[index + 1];
        if (current &&
            next &&
            current.kind !== "text" &&
            next.kind !== "text") {
            throw new Error("Adjacent holes are ambiguous. Add a literal delimiter between them.");
        }
    }
    const literalLength = tokens.reduce((total, token) => total + (token.kind === "text" ? token.value.length : 0), 0);
    if (literalLength === 0) {
        throw new Error("Template must include at least one literal character to avoid empty matches.");
    }
    return { source, tokens };
}
function resolveRawToken(token, nextEllipsisIndex) {
    if (token.kind === "text") {
        return token;
    }
    if (token.kind === "ellipsis") {
        return {
            kind: "ellipsis",
            index: nextEllipsisIndex(),
        };
    }
    if (token.constraintSource === null) {
        return {
            kind: "hole",
            name: token.name,
            anonymous: token.anonymous,
            constraintSource: token.constraintSource,
            constraintRegex: null,
        };
    }
    try {
        return {
            kind: "hole",
            name: token.name,
            anonymous: token.anonymous,
            constraintSource: token.constraintSource,
            constraintRegex: new RegExp(`^(?:${token.constraintSource})$`, "s"),
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid regex constraint for hole "${token.name}": ${message}`);
    }
}
function buildTemplateParseHint(source, baseError) {
    // When `:[` or `...` appear in source text they are treated as special tokens
    // unless escaped (e.g. `\\:[` or `\\...`).
    const hasUnclosedHole = source.lastIndexOf(":[") >= 0 && source.indexOf("]", source.lastIndexOf(":[") + 2) < 0;
    if (hasUnclosedHole && baseError.includes("closing ']'")) {
        return "If you meant a literal `:[` sequence (not a hole), escape it as `\\\\:[` (and `\\\\...` for a literal `...`).";
    }
    return "";
}
