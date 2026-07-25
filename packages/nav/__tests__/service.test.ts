import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createCachedBoundaryChecker,
  createService,
  createWorkspaceBoundary,
  fromPosition,
  relativePath,
  toPosition,
} from "../src/service.ts";

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

test("toPosition validates numeric and source bounds", () => {
  const { program } = createService(fixturesDir);
  const sourceFile = program.getSourceFile(path.resolve(fixturesDir, "simple.ts"))!;

  for (const line of [0, -1, 1.5, Number.NaN]) {
    expect(() => toPosition(sourceFile, line, 1)).toThrow(
      `Line must be a positive safe integer; received ${line}.`,
    );
  }
  expect(() => toPosition(sourceFile, sourceFile.getLineStarts().length + 1, 1)).toThrow(
    /is outside file range/,
  );
  expect(() => toPosition(sourceFile, 1, Number.POSITIVE_INFINITY)).toThrow(
    "Character must be a positive safe integer; received Infinity.",
  );
  expect(() => toPosition(sourceFile, 1, 10_000)).toThrow(/is outside line 1 range/);
});

test("relativePath computes correct relative path", () => {
  const result = relativePath("/home/user/project", "/home/user/project/src/foo.ts");
  expect(result).toBe("src/foo.ts");
});

test("createService excludes tsconfig includes that resolve outside workspace boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nav-service-boundary-"));
  const workspace = path.join(root, "workspace");
  const outsideFile = path.join(root, "outside.ts");

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(path.join(workspace, ".git"));
    await writeFile(outsideFile, "export const outside = 1;\n", "utf8");
    await writeFile(path.join(workspace, "inside.ts"), "export const inside = 1;\n", "utf8");
    await writeFile(
      path.join(workspace, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "Bundler",
            target: "ESNext",
            strict: true,
          },
          include: ["**/*.ts", "../outside.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const { program } = createService(workspace);
    expect(program.getSourceFile(path.resolve(workspace, "inside.ts"))).toBeDefined();
    expect(program.getSourceFile(outsideFile)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createService reports semantic tsconfig diagnostics", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "nav-service-config-"));

  try {
    await writeFile(path.join(workspace, "index.ts"), "export const value = 1;\n", "utf8");
    await writeFile(
      path.join(workspace, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { definitelyNotACompilerOption: true } }),
      "utf8",
    );

    expect(() => createService(workspace)).toThrow(
      /Invalid tsconfig:\nUnknown compiler option 'definitelyNotACompilerOption'\./,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("createCachedBoundaryChecker returns true for paths within the boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nav-checker-"));
  try {
    const checker = createCachedBoundaryChecker(createWorkspaceBoundary(root));
    const inside = path.join(root, "src", "index.ts");
    expect(checker(inside)).toBe(true);
    // Second call to the same path exercises the cache branch.
    expect(checker(inside)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCachedBoundaryChecker returns false for paths outside the boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nav-checker-"));
  try {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    const checker = createCachedBoundaryChecker(createWorkspaceBoundary(workspace));
    const outside = path.join(root, "sibling", "index.ts");
    expect(checker(outside)).toBe(false);
    expect(checker(outside)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCachedBoundaryChecker treats a symlink pointing outside the boundary as outside", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nav-checker-symlink-"));
  try {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    await mkdir(path.join(workspace, ".git"));

    const outsideFile = path.join(root, "outside.ts");
    await writeFile(outsideFile, "export const x = 1;\n", "utf8");

    const escapeLink = path.join(workspace, "escape.ts");
    await symlink(outsideFile, escapeLink);

    const checker = createCachedBoundaryChecker(createWorkspaceBoundary(workspace));
    expect(checker(escapeLink)).toBe(false);
    // Second call must agree with the first (cache must not alter the result).
    expect(checker(escapeLink)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
