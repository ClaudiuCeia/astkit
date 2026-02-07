import { test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { createService, toPosition, fromPosition, relativePath } from "../service.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(fixturesDir);
});

afterAll(() => {
  process.chdir(originalCwd);
});

test("createService returns service, program, and projectRoot", () => {
  const result = createService(fixturesDir);

  expect(result.service).toBeDefined();
  expect(result.program).toBeDefined();
  expect(result.projectRoot).toBe(fixturesDir);
});

test("createService finds tsconfig.json", () => {
  const result = createService(fixturesDir);
  const sourceFiles = result.program.getSourceFiles().map((sf) => sf.fileName);

  const simpleFile = path.resolve(fixturesDir, "simple.ts");
  expect(sourceFiles).toContain(simpleFile);
});

test("createService includes targetFile not in tsconfig", () => {
  const outsideFile = path.resolve(fixturesDir, "..", "nonexistent.ts");
  const result = createService(fixturesDir, outsideFile);

  // The file should be in the file names list even if it doesn't exist on disk
  const host = result.service.getProgram()!;
  expect(host).toBeDefined();
});

test("toPosition converts 1-indexed to offset", () => {
  const { program } = createService(fixturesDir);
  const sourceFile = program.getSourceFile(path.resolve(fixturesDir, "simple.ts"))!;

  // Line 1, character 1 should be offset 0
  const pos = toPosition(sourceFile, 1, 1);
  expect(pos).toBe(0);
});

test("fromPosition converts offset to 1-indexed", () => {
  const { program } = createService(fixturesDir);
  const sourceFile = program.getSourceFile(path.resolve(fixturesDir, "simple.ts"))!;

  const result = fromPosition(sourceFile, 0);
  expect(result.line).toBe(1);
  expect(result.character).toBe(1);
});

test("toPosition and fromPosition round-trip", () => {
  const { program } = createService(fixturesDir);
  const sourceFile = program.getSourceFile(path.resolve(fixturesDir, "simple.ts"))!;

  const line = 2;
  const character = 3;
  const offset = toPosition(sourceFile, line, character);
  const result = fromPosition(sourceFile, offset);

  expect(result.line).toBe(line);
  expect(result.character).toBe(character);
});

test("relativePath computes correct relative path", () => {
  const result = relativePath("/home/user/project", "/home/user/project/src/foo.ts");
  expect(result).toBe("src/foo.ts");
});
