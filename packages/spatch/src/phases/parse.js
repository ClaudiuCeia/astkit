import { resolveTextInput } from "@claudiu-ceia/astkit-core";
import { parsePatchDocument } from "../patch-document.js";
export function parsePatchSpec(patchDocument) {
    const parsed = parsePatchDocument(patchDocument);
    return {
        pattern: parsed.pattern,
        replacement: parsed.replacement,
    };
}
export async function parsePatchInvocation(patchInput, options = {}) {
    const patchDocument = await resolveTextInput(patchInput, options);
    return {
        patch: parsePatchSpec(patchDocument),
        options,
    };
}
