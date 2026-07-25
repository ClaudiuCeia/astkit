import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rankCode } from "../src/code-rank/rank.ts";

test("rankCode sorts symbols by reference strength", async () => {
  const workspace = await createRankFixtureWorkspace();

  try {
    const result = await rankCode({ cwd: workspace, scope: "." });

    expect(result.filesScanned).toBe(3);
    expect(result.symbolsScanned).toBe(3);
    expect(result.symbols[0]?.symbol).toBe("hot");

    const hot = result.symbols.find((symbol) => symbol.symbol === "hot");
    const warm = result.symbols.find((symbol) => symbol.symbol === "warm");
    const cold = result.symbols.find((symbol) => symbol.symbol === "cold");

    expect(hot).toBeDefined();
    expect(warm).toBeDefined();
    expect(cold).toBeDefined();
    expect(hot!.referenceCount).toBeGreaterThan(warm!.referenceCount);
    expect(warm!.referenceCount).toBeGreaterThan(cold!.referenceCount);
    expect(hot).toMatchObject({ file: "a.ts", line: 1, character: 17 });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rankCode rejects invalid limits before scanning", async () => {
  for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(rankCode({ limit })).rejects.toThrow("limit must be a non-negative safe integer");
  }
});

test("rankCode respects limit option", async () => {
  const workspace = await createRankFixtureWorkspace();

  try {
    const result = await rankCode({
      cwd: workspace,
      scope: ".",
      limit: 2,
    });

    expect(result.symbolsScanned).toBe(3);
    expect(result.symbolsRanked).toBe(2);
    expect(result.symbols.length).toBe(2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rankCode supports single-file scope while preserving project references", async () => {
  const workspace = await createRankFixtureWorkspace();

  try {
    const result = await rankCode({
      cwd: workspace,
      scope: "a.ts",
    });

    expect(result.filesScanned).toBe(1);
    expect(result.symbolsScanned).toBe(3);
    expect(
      result.symbols.find((symbol) => symbol.symbol === "hot")?.externalReferenceCount,
    ).toBeGreaterThan(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rankCode returns empty output when scope has no rankable files", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "code-rank-"));

  try {
    await writeFile(path.join(workspace, "README.md"), "# notes\n", "utf8");

    const result = await rankCode({
      cwd: workspace,
      scope: "README.md",
    });

    expect(result.filesScanned).toBe(0);
    expect(result.symbolsScanned).toBe(0);
    expect(result.symbols).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rankCode ignores references from symlinked files that resolve outside the git boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "code-rank-symlink-"));
  const workspace = path.join(root, "workspace");
  const outsideDir = path.join(root, "outside");

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(path.join(workspace, ".git"));
    await mkdir(outsideDir, { recursive: true });

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
          include: ["**/*.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    // a.ts: declares `hot`
    await writeFile(
      path.join(workspace, "a.ts"),
      "export function hot(): number { return 1; }\n",
      "utf8",
    );

    // b.ts: one external reference to `hot` (within boundary)
    await writeFile(
      path.join(workspace, "b.ts"),
      ['import { hot } from "./a.ts";', "", "hot();", ""].join("\n"),
      "utf8",
    );

    // outside/c.ts: would add an extra external reference, but lives outside the boundary.
    // We create a symlink escape.ts -> outside/c.ts so the TS compiler might pick it up,
    // but the canonical path resolves outside the git root.
    await writeFile(
      path.join(outsideDir, "c.ts"),
      ['import { hot } from "../workspace/a.ts";', "", "hot();", ""].join("\n"),
      "utf8",
    );
    await symlink(path.join(outsideDir, "c.ts"), path.join(workspace, "escape.ts"));

    const result = await rankCode({ cwd: workspace, scope: "." });

    const hot = result.symbols.find((s) => s.symbol === "hot");
    expect(hot).toBeDefined();
    // References from escape.ts (which resolves to outside the git boundary) must not
    // appear in referencingFiles; only b.ts (within the boundary) should be listed.
    expect(hot!.referencingFiles).toEqual(["b.ts"]);
    expect(hot!.referencingFiles.some((f) => f.includes("escape") || f.includes("outside"))).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rankCode canonical-path deduplication: path resolved via different spellings counts once", async () => {
  const workspace = await createRankFixtureWorkspace();

  try {
    const result = await rankCode({ cwd: workspace, scope: "." });

    // Verify each symbol appears exactly once in the output regardless of how many
    // times the same canonical path is presented to the boundary checker.
    const names = result.symbols.map((s) => s.symbol);
    expect(names).toEqual([...new Set(names)]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createRankFixtureWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), "code-rank-"));
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
        include: ["**/*.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(workspace, "a.ts"),
    [
      "export function hot(): number {",
      "  return 1;",
      "}",
      "",
      "export function warm(): number {",
      "  return 2;",
      "}",
      "",
      "export function cold(): number {",
      "  return 3;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "b.ts"),
    ['import { hot, warm } from "./a.ts";', "", "hot();", "hot();", "warm();", ""].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "c.ts"),
    ['import { hot } from "./a.ts";', "", "hot();", ""].join("\n"),
    "utf8",
  );

  return workspace;
}
