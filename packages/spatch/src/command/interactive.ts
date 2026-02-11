export { runInteractivePatchCommand } from "./interactive/run.ts";
export {
  createTerminalInteractiveDecider,
  formatInteractiveChangeBlock,
  parseInteractiveChoice,
} from "./interactive/terminal.ts";
export { validateSelectedOccurrences } from "./interactive/validation.ts";
export type {
  InteractiveChoice,
  InteractiveContext,
  InteractiveDecider,
  RunInteractivePatchCommandOptions,
} from "./interactive/types.ts";
