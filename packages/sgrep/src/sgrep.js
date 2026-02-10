import { buildSgrepResult } from "./phases/output.js";
import { parseSearchInvocation, } from "./phases/parse.js";
import { searchProjectFiles } from "./phases/search.js";
export async function searchProject(patternInput, options = {}) {
    const invocation = await parseSearchInvocation(patternInput, options);
    return runSearchPhases(invocation.search, invocation.options);
}
export const sgrep = searchProject;
async function runSearchPhases(search, options) {
    const startedAt = Date.now();
    const phase = await searchProjectFiles(search, options);
    return buildSgrepResult({
        search,
        phase,
        elapsedMs: Date.now() - startedAt,
    });
}
