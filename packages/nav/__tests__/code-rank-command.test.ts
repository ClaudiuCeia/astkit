import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatCodeRankOutput, runCodeRankCommand } from "../src/code-rank/code-rank.ts";

test("runCodeRankCommand ranks scoped symbols", async () => {
  const workspace = await createRankFixtureWorkspace();

  try {
    const result = await runCodeRankCommand(".", {
      cwd: workspace,
      limit: 2,
    });

    expect(result.symbols.length).toBe(2);
    expect(result.symbols[0]?.symbol).toBe("hot");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("formatCodeRankOutput renders compact ranking lines", () => {
  const output = formatCodeRankOutput({
    cwd: "/repo",
    scope: "/repo/src",
    filesScanned: 1,
    symbolsScanned: 1,
    symbolsRanked: 1,
    symbols: [
      {
        symbol: "hot",
        kind: "function",
        file: "src/a.ts",
        line: 1,
        character: 8,
        score: 14,
        referenceCount: 3,
        internalReferenceCount: 0,
        externalReferenceCount: 3,
        referencingFileCount: 2,
        referencingFiles: ["src/b.ts", "src/c.ts"],
      },
    ],
  });

  expect(output).toContain("1. score=14");
  expect(output).toContain("function hot src/a.ts:1:8");
});

test("formatCodeRankOutput handles empty rankings", () => {
  const output = formatCodeRankOutput({
    cwd: "/repo",
    scope: "/repo/src",
    filesScanned: 0,
    symbolsScanned: 0,
    symbolsRanked: 0,
    symbols: [],
  });

  expect(output).toBe("No ranked symbols.");
});

async function createRankFixtureWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), "code-rank-command-"));
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
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "b.ts"),
    ['import { hot, warm } from "./a.ts";', "", "hot();", "warm();", ""].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "c.ts"),
    ['import { hot } from "./a.ts";', "", "hot();", ""].join("\n"),
    "utf8",
  );

  return workspace;
}
