export { createService, fromPosition, relativePath, toPosition } from "./service.ts";
export type { Service } from "./service.ts";

export { parseFilePosition } from "./nav/location.ts";
export type { FilePosition } from "./nav/location.ts";

export {
  declarationsCommand,
  formatDeclarationsOutput,
  getDeclarations,
} from "./nav/declarations.ts";
export type {
  DeclarationInfo,
  DeclarationsOutput,
  FormatDeclarationsOutputOptions,
  MemberInfo,
  OverloadInfo,
} from "./nav/declarations.ts";
export { definitionCommand, getDefinition } from "./nav/definition.ts";
export type { DefinitionLocation, DefinitionOutput } from "./nav/definition.ts";
export { getReferences, referencesCommand } from "./nav/references.ts";
export type { ReferenceLocation, ReferencesOutput } from "./nav/references.ts";

export {
  codeRankCommand,
  formatCodeRankOutput,
  runCodeRankCommand,
} from "./code-rank/code-rank.ts";
export type { CodeRankCommandFlags } from "./code-rank/code-rank.ts";
export {
  rankCode,
  type CodeRankOptions,
  type CodeRankResult,
  type RankedSymbol,
} from "./code-rank/rank.ts";
