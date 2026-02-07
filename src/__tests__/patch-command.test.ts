import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Chalk } from "chalk";
import { formatPatchOutput, runPatchCommand } from "../patch/patch.ts";
import type { SpatchResult } from "../spatch/types.ts";

test("runPatchCommand applies patch document string in scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join(
      "\n",
    );

    const result = await runPatchCommand(patch, workspace, {});

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand resolves patch document from file using cwd", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const sourceFile = path.join(workspace, "sample.ts");
    const patchFile = path.join(workspace, "rule.spatch");

    await writeFile(sourceFile, "const value = 1;\n", "utf8");
    await writeFile(
      patchFile,
      ["-const :[name] = :[value];", "+let :[name] = :[value];", ""].join("\n"),
      "utf8",
    );

    const result = await runPatchCommand("rule.spatch", ".", { cwd: workspace });

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(sourceFile, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand supports dryRun flag", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const original = "const value = 1;\n";
    await writeFile(target, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join(
      "\n",
    );

    const result = await runPatchCommand(patch, workspace, { "dry-run": true });

    expect(result.dryRun).toBe(true);
    expect(result.totalMatches).toBe(1);
    expect(await readFile(target, "utf8")).toBe(original);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive mode applies selected matches only", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const first = 1;\nconst second = 2;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join(
      "\n",
    );

    const answers: Array<"yes" | "no"> = ["yes", "no"];
    const result = await runPatchCommand(
      patch,
      workspace,
      { interactive: true },
      {
        interactiveDecider: async () => answers.shift() ?? "no",
      },
    );

    expect(result.dryRun).toBe(false);
    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let first = 1;\nconst second = 2;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive decider receives progress metadata", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const first = 1;\nconst second = 2;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join(
      "\n",
    );

    const seen: Array<{ changeNumber: number; totalChanges: number }> = [];
    await runPatchCommand(
      patch,
      workspace,
      { interactive: true },
      {
        interactiveDecider: async (ctx) => {
          seen.push({
            changeNumber: ctx.changeNumber,
            totalChanges: ctx.totalChanges,
          });
          return "no";
        },
      },
    );

    expect(seen).toEqual([
      { changeNumber: 1, totalChanges: 2 },
      { changeNumber: 2, totalChanges: 2 },
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand rejects --interactive with --dry-run", async () => {
  let thrown: unknown = null;

  try {
    await runPatchCommand(
      ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n"),
      ".",
      { interactive: true, "dry-run": true },
    );
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
});

test("formatPatchOutput renders compact diff-like output", () => {
  const result: SpatchResult = {
    dryRun: true,
    scope: "/tmp/workspace/src",
    pattern: "const :[name] = :[value];",
    replacement: "let :[name] = :[value];",
    filesScanned: 1,
    filesMatched: 1,
    filesChanged: 1,
    totalMatches: 1,
    totalReplacements: 1,
    elapsedMs: 1,
    files: [
      {
        file: "src/sample.ts",
        matchCount: 1,
        replacementCount: 1,
        changed: true,
        byteDelta: -2,
        occurrences: [
          {
            start: 0,
            end: 14,
            line: 3,
            character: 1,
            matched: "const foo = 42;",
            replacement: "let foo = 42;",
            captures: {
              name: "foo",
              value: "42",
            },
          },
        ],
      },
    ],
  };

  const output = formatPatchOutput(result, {
    color: false,
  });

  expect(output).toContain("diff --git a/src/sample.ts b/src/sample.ts");
  expect(output).toContain("@@ -3,1 +3,1 @@");
  expect(output).toContain("-const foo = 42;");
  expect(output).toContain("+let foo = 42;");
  expect(output).toContain("1 file changed, 1 replacement, (dry-run)");
});

test("formatPatchOutput supports no-change summary", () => {
  const result: SpatchResult = {
    dryRun: true,
    scope: "/tmp/workspace/src",
    pattern: "const :[name] = :[value];",
    replacement: "const :[name] = :[value];",
    filesScanned: 1,
    filesMatched: 0,
    filesChanged: 0,
    totalMatches: 0,
    totalReplacements: 0,
    elapsedMs: 1,
    files: [],
  };

  const output = formatPatchOutput(result, {
    color: true,
    chalkInstance: new Chalk({ level: 1 }),
  });

  expect(output).toContain("No changes.");
  expect(output).toContain("0 files changed, 0 replacements, (dry-run)");
  expect(output).toContain("\u001b[");
});
