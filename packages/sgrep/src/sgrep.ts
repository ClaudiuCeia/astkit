import { buildSgrepResult } from "./phases/output.ts";
import { parseSearchInvocation, type ParsedSearchSpec } from "./phases/parse.ts";
import { searchProjectFiles } from "./phases/search.ts";
import type { SgrepOptions, SgrepResult } from "./types.ts";

/**
 * Runs structural search over a scope using a template pattern.
 *
 * `patternInput` can be inline pattern text or a path to a pattern file.
 */
export async function searchProject(
  patternInput: string,
  options: SgrepOptions = {},
): Promise<SgrepResult> {
  const invocation = await parseSearchInvocation(patternInput, options);

  return runSearchPhases(invocation.search, invocation.options);
}

/** Alias of {@link searchProject}. */
export const sgrep = searchProject;

async function runSearchPhases(
  search: ParsedSearchSpec,
  options: SgrepOptions,
): Promise<SgrepResult> {
  const startedAt = Date.now();
  const phase = await searchProjectFiles(search, options);

  return buildSgrepResult({
    search,
    phase,
    elapsedMs: Date.now() - startedAt,
  });
}
