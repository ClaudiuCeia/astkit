import { resolveTextInput } from "../../common/input.ts";
import { parsePatchDocument } from "../patch-document.ts";
import type { SpatchOptions } from "../types.ts";

export type ParsedPatchSpec = {
  pattern: string;
  replacement: string;
};

export type ParsedPatchInvocation = {
  patch: ParsedPatchSpec;
  options: SpatchOptions;
};

export function parsePatchSpec(patchDocument: string): ParsedPatchSpec {
  const parsed = parsePatchDocument(patchDocument);
  return {
    pattern: parsed.pattern,
    replacement: parsed.replacement,
  };
}

export async function parsePatchInvocation(
  patchInput: string,
  options: SpatchOptions = {},
): Promise<ParsedPatchInvocation> {
  const patchDocument = await resolveTextInput(patchInput, options);

  return {
    patch: parsePatchSpec(patchDocument),
    options,
  };
}
