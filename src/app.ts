import { buildApplication, buildRouteMap, text_en } from "@stricli/core";
import { declarationsCommand } from "./nav/declarations.ts";
import { definitionCommand } from "./nav/definition.ts";
import { referencesCommand } from "./nav/references.ts";

const navRouteMap = buildRouteMap({
  routes: {
    declarations: declarationsCommand,
    definition: definitionCommand,
    references: referencesCommand,
  },
  docs: {
    brief: "Code navigation and reading",
    declarations: "List exported declarations and type signatures",
    definition: "Go to definition at position",
    references: "Find all references at position",
  },
});

const rootRouteMap = buildRouteMap({
  routes: {
    nav: navRouteMap,
  },
  docs: {
    brief: "Semantic code intelligence for LLM agents",
    nav: "Code navigation and reading",
  },
});

export const app = buildApplication(rootRouteMap, {
  name: "semantic",
  scanner: {
    caseStyle: "original",
  },
  documentation: {
    caseStyle: "original",
  },
  localization: {
    defaultLocale: "en",
    loadText: () => text_en,
  },
});
