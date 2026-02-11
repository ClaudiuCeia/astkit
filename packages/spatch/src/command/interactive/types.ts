import type { SpatchOccurrence, SpatchOptions } from "../../types.ts";

export type InteractiveChoice = "yes" | "no" | "all" | "quit";

export type InteractiveContext = {
  file: string;
  occurrence: SpatchOccurrence;
  changeNumber: number;
  totalChanges: number;
};

export type InteractiveDecider = (ctx: InteractiveContext) => Promise<InteractiveChoice>;

export type RunInteractivePatchCommandOptions = Pick<
  SpatchOptions,
  "concurrency" | "cwd" | "encoding" | "logger" | "scope" | "verbose"
> & {
  noColor: boolean;
  interactiveDecider?: InteractiveDecider;
};
