import { test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { getDefinition } from "../nav/definition.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(fixturesDir);
});

afterAll(() => {
  process.chdir(originalCwd);
});

test("resolves definition of imported symbol", () => {
  // In importer.ts line 1: import { User, UserService, createUser, Role } from "./simple.ts";
  // "User" starts at character 10
  const result = getDefinition("importer.ts", 1, 10);

  expect(result.definitions.length).toBeGreaterThan(0);
  const def = result.definitions[0]!;
  expect(def.file).toBe("simple.ts");
  expect(def.line).toBe(1); // User interface starts at line 1
});

test("resolves definition of local variable usage", () => {
  // In importer.ts line 13: const found = service.findById("1");
  // "findById" starts at character 24 (1-indexed, after "const found = service.")
  const result = getDefinition("importer.ts", 13, 24);

  expect(result.definitions.length).toBeGreaterThan(0);
  const def = result.definitions[0]!;
  expect(def.file).toBe("simple.ts");
});

test("resolves definition within same file", () => {
  // In simple.ts, the UserService class references User
  // Line 8: private users: User[] = [];
  // "User" at approx character 18
  const result = getDefinition("simple.ts", 8, 18);

  expect(result.definitions.length).toBeGreaterThan(0);
  const def = result.definitions[0]!;
  expect(def.file).toBe("simple.ts");
  expect(def.line).toBe(1); // User interface at line 1
});

test("returns empty definitions for position with no definition", () => {
  // Point at whitespace/string literal — line 21, char 30 is inside a string
  const result = getDefinition("simple.ts", 21, 30);

  expect(result.definitions.length).toBe(0);
});
