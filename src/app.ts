import { buildApplication, buildRouteMap, text_en } from "@stricli/core";
import { codeRankCommand } from "./code-rank/code-rank.ts";
import { declarationsCommand } from "./nav/declarations.ts";
import { definitionCommand } from "./nav/definition.ts";
import { referencesCommand } from "./nav/references.ts";
import { patchCommand } from "./patch/patch.ts";
import { searchCommand } from "./search/search.ts";

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
    brief: "Semantic code intelligence for LLM agents",
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
