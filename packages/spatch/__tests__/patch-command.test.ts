import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Chalk } from "chalk";
import { formatPatchOutput, runPatchCommand, validatePatchCommandFlags } from "../src/command.ts";
import { validateSelectedOccurrences } from "../src/command/interactive.ts";
import type { SpatchResult } from "../src/types.ts";

test("runPatchCommand applies patch document string in scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

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

test("runPatchCommand can read patch document from stdin when patchInput is '-'", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand("-", workspace, {}, { readStdin: async () => patch });

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let value = 1;\n");
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

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(patch, workspace, { "dry-run": true });

    expect(result.dryRun).toBe(true);
    expect(result.totalMatches).toBe(1);
    expect(await readFile(target, "utf8")).toBe(original);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand supports check flag as dry-run guardrail", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const original = "const value = 1;\n";
    await writeFile(target, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(patch, workspace, { check: true });

    expect(result.dryRun).toBe(true);
    expect(result.totalReplacements).toBe(1);
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

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

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

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

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

test("runPatchCommand interactive mode honors encoding for file IO", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, Buffer.from("// café\nconst value = 1;\n", "latin1"));

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(
      patch,
      workspace,
      { interactive: true },
      {
        encoding: "latin1",
        interactiveDecider: async () => "yes",
      },
    );

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    const actual = await readFile(target);
    const expected = Buffer.from("// café\nlet value = 1;\n", "latin1");
    expect(actual.equals(expected)).toBe(true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive aborts when file changes before apply and avoids partial writes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const firstFile = path.join(workspace, "a.ts");
    const secondFile = path.join(workspace, "b.ts");
    await writeFile(firstFile, "const first = 1;\n", "utf8");
    await writeFile(secondFile, "const second = 2;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const externallyMutatedSecond = "/* external edit */\nconst second = 2;\n";
    let mutated = false;

    await expect(
      runPatchCommand(
        patch,
        ".",
        { interactive: true, cwd: workspace },
        {
          interactiveDecider: async () => {
            if (!mutated) {
              mutated = true;
              await writeFile(secondFile, externallyMutatedSecond, "utf8");
            }
            return "yes";
          },
        },
      ),
    ).rejects.toThrow("File changed during interactive patch selection");

    // No partial apply should happen on other files.
    expect(await readFile(firstFile, "utf8")).toBe("const first = 1;\n");
    expect(await readFile(secondFile, "utf8")).toBe(externallyMutatedSecond);
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

test("runPatchCommand validates flag combinations before reading patch input", async () => {
  let readStdinCalls = 0;

  await expect(
    runPatchCommand(
      "-",
      ".",
      { interactive: true, "dry-run": true },
      {
        readStdin: async () => {
          readStdinCalls += 1;
          throw new Error("stdin should not be read for invalid flag combination");
        },
      },
    ),
  ).rejects.toThrow("Cannot combine --interactive with --dry-run.");

  expect(readStdinCalls).toBe(0);
});

test("validatePatchCommandFlags rejects --interactive with --dry-run", () => {
  expect(() => validatePatchCommandFlags({ interactive: true, "dry-run": true })).toThrow(
    "Cannot combine --interactive with --dry-run.",
  );
});

test("validatePatchCommandFlags rejects --interactive with --check", () => {
  expect(() => validatePatchCommandFlags({ interactive: true, check: true })).toThrow(
    "Cannot combine --interactive with --check.",
  );
});

test("validateSelectedOccurrences rejects overlapping spans", () => {
  const source = "const a = 1;\nconst b = 2;\n";

  expect(() =>
    validateSelectedOccurrences("sample.ts", source, [
      {
        start: 0,
        end: 10,
        line: 1,
        character: 1,
        matched: source.slice(0, 10),
        replacement: "x",
        captures: {},
      },
      {
        start: 5,
        end: 15,
        line: 1,
        character: 6,
        matched: source.slice(5, 15),
        replacement: "y",
        captures: {},
      },
    ]),
  ).toThrow("Invalid overlapping interactive occurrences");
});

test("validateSelectedOccurrences accepts non-overlapping spans", () => {
  const source = "const a = 1;\nconst b = 2;\n";

  expect(() =>
    validateSelectedOccurrences("sample.ts", source, [
      {
        start: 0,
        end: 12,
        line: 1,
        character: 1,
        matched: "const a = 1;",
        replacement: "let a = 1;",
        captures: {},
      },
      {
        start: 13,
        end: 25,
        line: 2,
        character: 1,
        matched: "const b = 2;",
        replacement: "let b = 2;",
        captures: {},
      },
    ]),
  ).not.toThrow();
});

test("runPatchCommand interactive mode forwards concurrency and verbose logger", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const first = 1;\nconst second = 2;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");
    const logs: string[] = [];

    await runPatchCommand(
      patch,
      workspace,
      { interactive: true, concurrency: 3, verbose: 1 },
      {
        interactiveDecider: async () => "no",
        logger: (line) => logs.push(line),
      },
    );

    expect(logs.some((line) => line.includes("[spatch] rewriteFiles"))).toBe(true);
    expect(logs.some((line) => line.includes("concurrency=3"))).toBe(true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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

test("formatPatchOutput uses logical line counts for newline-terminated chunks", () => {
  const result: SpatchResult = {
    dryRun: true,
    scope: "/tmp/workspace/src",
    pattern: "const :[name] = :[value];\n",
    replacement: "let :[name] = :[value];\n",
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
            end: 15,
            line: 3,
            character: 1,
            matched: "const foo = 42;\n",
            replacement: "let foo = 42;\n",
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

  expect(output).toContain("@@ -3,1 +3,1 @@");
  expect(output).not.toContain("\n-\n");
  expect(output).not.toContain("\n+\n");
});

test("cli --check exits non-zero when replacements would be made", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const patchFile = path.join(workspace, "rule.spatch");
    await writeFile(target, "const value = 1;\n", "utf8");
    await writeFile(
      patchFile,
      ["-const :[name] = :[value];", "+let :[name] = :[value];", ""].join("\n"),
      "utf8",
    );

    const cli = Bun.spawnSync({
      cmd: ["bun", "run", "packages/spatch/src/cli.ts", patchFile, workspace, "--check"],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(cli.exitCode).toBe(1);
    expect(new TextDecoder().decode(cli.stderr)).toContain("Check failed");
    expect(await readFile(target, "utf8")).toBe("const value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
