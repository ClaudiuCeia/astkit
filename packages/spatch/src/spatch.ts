import { buildSpatchResult } from "./phases/output.ts";
import { parsePatchInvocation, type ParsedPatchSpec } from "./phases/parse.ts";
import { rewriteProject } from "./phases/rewrite.ts";
import type { SpatchOptions, SpatchResult } from "./types.ts";

export async function patchProject(
  patchInput: string,
  options: SpatchOptions = {},
): Promise<SpatchResult> {
  const invocation = await parsePatchInvocation(patchInput, options);

  return runPatchPhases(invocation.patch, invocation.options);
}

async function runPatchPhases(
  patch: ParsedPatchSpec,
  options: SpatchOptions,
): Promise<SpatchResult> {
  const startedAt = Date.now();

  const rewrite = await rewriteProject(patch, options);
  return buildSpatchResult({
    patch,
    rewrite,
    elapsedMs: Date.now() - startedAt,
  });
}
