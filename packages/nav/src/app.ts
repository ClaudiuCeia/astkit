import { buildApplication, buildRouteMap, text_en } from "@stricli/core";
import { codeRankCommand } from "./code-rank/code-rank.ts";
import { declarationsCommand } from "./nav/declarations.ts";
import { definitionCommand } from "./nav/definition.ts";
import { referencesCommand } from "./nav/references.ts";

function formatCommandException(exc: unknown): string {
  if (exc instanceof Error) {
    return exc.message.length > 0 ? `Error: ${exc.message}` : "Error";
  }
  return String(exc);
}

const text = {
  ...text_en,
  exceptionWhileParsingArguments: (exc: unknown) =>
    `Unable to parse arguments, ${formatCommandException(exc)}`,
  exceptionWhileLoadingCommandFunction: (exc: unknown) =>
    `Unable to load command function, ${formatCommandException(exc)}`,
  exceptionWhileLoadingCommandContext: (exc: unknown) =>
    `Unable to load command context, ${formatCommandException(exc)}`,
  exceptionWhileRunningCommand: (exc: unknown) =>
    `Command failed, ${formatCommandException(exc)}`,
};

const rootRouteMap = buildRouteMap({
  routes: {
    declarations: declarationsCommand,
    definition: definitionCommand,
    references: referencesCommand,
    "code-rank": codeRankCommand,
  },
  docs: {
    brief: "TypeScript navigation and reference tooling",
  },
});

export const app = buildApplication(rootRouteMap, {
  name: "nav",
  scanner: {
    caseStyle: "original",
  },
  documentation: {
    caseStyle: "original",
  },
  localization: {
    defaultLocale: "en",
    loadText: () => text,
  },
});

