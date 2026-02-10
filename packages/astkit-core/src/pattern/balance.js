function isOpening(ch) {
    return ch === "(" || ch === "[" || ch === "{";
}
function matchingOpen(close) {
    if (close === ")")
        return "(";
    if (close === "]")
        return "[";
    if (close === "}")
        return "{";
    return null;
}
// Fast structural-balance check used by the template matcher.
// Needs to be permissive for JS/TS fragments: ignore delimiters inside strings
// and comments; handle template literals with `${...}` expressions.
export function isBalancedChunk(chunk) {
    let mode = "normal";
    const stack = [];
    for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i] ?? "";
        const next = i + 1 < chunk.length ? chunk[i + 1] : "";
        if (mode === "line-comment") {
            if (ch === "\n") {
                mode = "normal";
            }
            continue;
        }
        if (mode === "block-comment") {
            if (ch === "*" && next === "/") {
                mode = "normal";
                i += 1;
            }
            continue;
        }
        if (mode === "single") {
            if (ch === "\\") {
                i += 1; // skip escaped char
                continue;
            }
            if (ch === "'") {
                mode = "normal";
            }
            continue;
        }
        if (mode === "double") {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === "\"") {
                mode = "normal";
            }
            continue;
        }
        if (mode === "template") {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === "`") {
                mode = "normal";
                continue;
            }
            if (ch === "$" && next === "{") {
                stack.push({ delim: "{", templateExpr: true });
                mode = "normal";
                i += 1;
            }
            continue;
        }
        // mode === "normal"
        if (ch === "/" && next === "/") {
            mode = "line-comment";
            i += 1;
            continue;
        }
        if (ch === "/" && next === "*") {
            mode = "block-comment";
            i += 1;
            continue;
        }
        if (ch === "'") {
            mode = "single";
            continue;
        }
        if (ch === "\"") {
            mode = "double";
            continue;
        }
        if (ch === "`") {
            mode = "template";
            continue;
        }
        if (isOpening(ch)) {
            stack.push({ delim: ch, templateExpr: false });
            continue;
        }
        const open = matchingOpen(ch);
        if (!open) {
            continue;
        }
        const top = stack.pop();
        if (!top || top.delim !== open) {
            return false;
        }
        if (ch === "}" && top.templateExpr) {
            // End of `${ ... }` in a template literal.
            mode = "template";
        }
    }
    return mode === "normal" && stack.length === 0;
}
