import { buildSpatchResult } from "./phases/output.js";
import { parsePatchInvocation, } from "./phases/parse.js";
import { rewriteProject } from "./phases/rewrite.js";
export async function patchProject(patchInput, options = {}) {
    const invocation = await parsePatchInvocation(patchInput, options);
    return runPatchPhases(invocation.patch, invocation.options);
}
export const spatch = patchProject;
async function runPatchPhases(patch, options) {
    const startedAt = Date.now();
    const rewrite = await rewriteProject(patch, options);
    return buildSpatchResult({
        patch,
        rewrite,
        elapsedMs: Date.now() - startedAt,
    });
}
