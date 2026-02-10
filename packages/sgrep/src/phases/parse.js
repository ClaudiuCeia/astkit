import { resolveTextInput } from "@claudiu-ceia/astkit-core";
export function parseSearchSpec(pattern) {
    return { pattern };
}
export async function parseSearchInvocation(patternInput, options = {}) {
    const pattern = await resolveTextInput(patternInput, options);
    return {
        search: parseSearchSpec(pattern),
        options,
    };
}
