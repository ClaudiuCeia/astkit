import { buildApplication, text_en } from "@stricli/core";
import { patchCommand } from "./command.ts";

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

export const app = buildApplication(patchCommand, {
  name: "spatch",
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
