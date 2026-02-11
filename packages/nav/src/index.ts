export { createService, fromPosition, relativePath, toPosition } from "./service.ts";

export { parseFilePosition } from "./nav/location.ts";
export type { FilePosition } from "./nav/location.ts";

export {
  declarationsCommand,
  formatDeclarationsOutput,
  getDeclarations,
} from "./nav/declarations.ts";
export { definitionCommand, getDefinition } from "./nav/definition.ts";
export { getReferences, referencesCommand } from "./nav/references.ts";

export {
  codeRankCommand,
  formatCodeRankOutput,
  runCodeRankCommand,
} from "./code-rank/code-rank.ts";
export {
  rankCode,
  type CodeRankOptions,
  type CodeRankResult,
  type RankedSymbol,
} from "./code-rank/rank.ts";
