import { tokenizeTemplate } from "./syntax.js";
import { ELLIPSIS_CAPTURE_PREFIX } from "./types.js";
export function renderTemplate(source, captures) {
    if (source.length === 0) {
        return "";
    }
    const tokens = tokenizeTemplate(source);
    let rendered = "";
    for (const token of tokens) {
        if (token.kind === "text") {
            rendered += token.value;
            continue;
        }
        if (token.kind === "ellipsis") {
            const value = captures[`${ELLIPSIS_CAPTURE_PREFIX}${token.index}`];
            if (value === undefined) {
                throw new Error(`Replacement uses ellipsis #${token.index + 1} but pattern did not capture it.`);
            }
            rendered += value;
            continue;
        }
        if (token.anonymous) {
            continue;
        }
        const value = captures[token.name];
        if (value === undefined) {
            throw new Error(`Replacement uses unknown hole "${token.name}".`);
        }
        rendered += value;
    }
    return rendered;
}
