import { test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { dedupeReferenceLocations, getReferences } from "../src/nav/references.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(fixturesDir);
});

afterAll(() => {
  process.chdir(originalCwd);
});

test("finds cross-file references for User interface", () => {
  // User is defined in simple.ts line 1, character 18
  const result = getReferences("simple.ts", 1, 18);

  expect(result.references.length).toBeGreaterThan(1);

  const files = result.references.map((r) => r.file);
  expect(files).toContain("simple.ts");
  expect(files).toContain("importer.ts");
});

test("includes definition in references", () => {
  const result = getReferences("simple.ts", 1, 18);

  const defRef = result.references.find((r) => r.isDefinition);
  expect(defRef).toBeDefined();
});

test("definition field is populated", () => {
  const result = getReferences("simple.ts", 1, 18);

  expect(result.definition).not.toBeNull();
  expect(result.definition!.file).toBe("simple.ts");
  expect(result.definition!.line).toBe(1);
});

test("finds references for createUser function", () => {
  // createUser at simple.ts line 19: export function createUser(...)
  // "createUser" starts at character 17
  const result = getReferences("simple.ts", 19, 17);

  expect(result.references.length).toBeGreaterThanOrEqual(2);

  const files = result.references.map((r) => r.file);
  expect(files).toContain("simple.ts");
  expect(files).toContain("importer.ts");
});

test("returns empty references for position with no symbol", () => {
  // Point at whitespace or string literal
  const result = getReferences("simple.ts", 21, 30);

  expect(result.references.length).toBe(0);
});

test("getReferences returns unique reference spans", () => {
  const result = getReferences("simple.ts", 1, 18);
  const spans = result.references.map((ref) => `${ref.file}:${ref.line}:${ref.character}`);
  const uniqueSpans = new Set(spans);
  expect(uniqueSpans.size).toBe(spans.length);
});

test("dedupeReferenceLocations merges duplicate rows by span", () => {
  const deduped = dedupeReferenceLocations([
    {
      file: "src/a.ts",
      line: 1,
      character: 1,
      isDefinition: false,
      isWriteAccess: false,
    },
    {
      file: "src/a.ts",
      line: 1,
      character: 1,
      isDefinition: true,
      isWriteAccess: false,
    },
    {
      file: "src/a.ts",
      line: 1,
      character: 1,
      isDefinition: false,
      isWriteAccess: true,
    },
    {
      file: "src/b.ts",
      line: 2,
      character: 3,
      isDefinition: false,
      isWriteAccess: false,
    },
  ]);

  expect(deduped.length).toBe(2);
  expect(deduped[0]).toEqual({
    file: "src/a.ts",
    line: 1,
    character: 1,
    isDefinition: true,
    isWriteAccess: true,
  });
  expect(deduped[1]).toEqual({
    file: "src/b.ts",
    line: 2,
    character: 3,
    isDefinition: false,
    isWriteAccess: false,
  });
});
