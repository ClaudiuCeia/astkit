import { buildApplication, buildRouteMap, text_en } from "@stricli/core";
import {
  codeRankCommand,
  declarationsCommand,
  definitionCommand,
  referencesCommand,
} from "@claudiu-ceia/nav";
import { patchCommand } from "@claudiu-ceia/spatch";
import { searchCommand } from "@claudiu-ceia/sgrep";

function formatCommandException(exc: unknown): string {
  if (exc instanceof Error) {
    // Avoid printing stack traces for user-facing command errors by default.
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

const navRouteMap = buildRouteMap({
  routes: {
    declarations: declarationsCommand,
    definition: definitionCommand,
    references: referencesCommand,
  },
  docs: {
    brief: "Code navigation and reading",
  },
});

const rootRouteMap = buildRouteMap({
  routes: {
    nav: navRouteMap,
    search: searchCommand,
    patch: patchCommand,
    "code-rank": codeRankCommand,
  },
  docs: {
    brief: "Structural and type-aware code tooling for TS/JS",
  },
});

export const app = buildApplication(rootRouteMap, {
  name: "astkit",
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
