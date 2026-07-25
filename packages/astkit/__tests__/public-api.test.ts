import { expect, test } from "bun:test";
import {
  getDeclarations,
  patchProject,
  searchProject,
  type CodeRankCommandFlags,
  type DeclarationInfo,
  type DeclarationsOutput,
  type DefinitionOutput,
  type FormatDeclarationsOutputOptions,
  type FormatSearchOutputOptions,
  type MemberInfo,
  type ReferenceLocation,
  type ReferencesOutput,
  type Service,
} from "../src/index.ts";

test("umbrella package exposes public functions", () => {
  expect(typeof patchProject).toBe("function");
  expect(typeof searchProject).toBe("function");
  expect(typeof getDeclarations).toBe("function");
});

test("umbrella package exposes nameable public API types", () => {
  const values: [
    Service?,
    MemberInfo?,
    DeclarationInfo?,
    DeclarationsOutput?,
    FormatDeclarationsOutputOptions?,
    DefinitionOutput?,
    ReferenceLocation?,
    ReferencesOutput?,
    CodeRankCommandFlags?,
    FormatSearchOutputOptions?,
  ] = [];

  expect(values).toEqual([]);
});
