import { parseTextInvocation } from "@claudiu-ceia/astkit-core";
import type { SgrepOptions } from "../types.ts";

export type ParsedSearchSpec = {
  pattern: string;
};

export type ParsedSearchInvocation = {
  search: ParsedSearchSpec;
  options: SgrepOptions;
};

export function parseSearchSpec(pattern: string): ParsedSearchSpec {
  return { pattern };
}

export async function parseSearchInvocation(
  patternInput: string,
  options: SgrepOptions = {},
): Promise<ParsedSearchInvocation> {
  const invocation = await parseTextInvocation(
    patternInput,
    options,
    parseSearchSpec,
  );

  return {
    search: invocation.spec,
    options: invocation.options,
  };
}
