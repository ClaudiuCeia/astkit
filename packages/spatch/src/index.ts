export {
  patchProject,
  spatch,
} from "./spatch.ts";
export type {
  SpatchFileResult,
  SpatchOccurrence,
  SpatchOptions,
  SpatchResult,
} from "./types.ts";
export {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_PATCHABLE_EXTENSIONS,
} from "./types.ts";

export {
  formatPatchOutput,
  patchCommand,
  runPatchCommand,
} from "./command.ts";
export type { PatchCommandFlags } from "./command.ts";
