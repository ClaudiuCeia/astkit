import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rankCode } from "../code-rank/rank.ts";

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
  } finally {
    await rm(workspace, { recursive: true, force: true });
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
    expect(result.symbols.find((symbol) => symbol.symbol === "hot")?.externalReferenceCount).toBeGreaterThan(0);
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
    [
      'import { hot, warm } from "./a.ts";',
      "",
      "hot();",
      "hot();",
      "warm();",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "c.ts"),
    ['import { hot } from "./a.ts";', "", "hot();", ""].join("\n"),
    "utf8",
  );

  return workspace;
}
