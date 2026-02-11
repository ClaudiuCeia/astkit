import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { Chalk } from "chalk";
import { patchCommand, runPatchCommand } from "../src/command.ts";
import { patchCommandFlagParameters, validatePatchCommandFlags } from "../src/command/flags.ts";
import { validateSelectedOccurrences } from "../src/command/interactive/validation.ts";
import { formatPatchOutput } from "../src/command/output.ts";
import type { SpatchResult } from "../src/types.ts";

function resolvePatchCommandExecutor() {
  return patchCommand
    .loader()
    .then(
      (loaded) =>
        loaded as (
          this: { process: { stdout: { write(s: string): void } } },
          flags: Record<string, unknown>,
          patchInput: string,
          scope?: string,
        ) => Promise<void>,
    );
}

test("runPatchCommand applies patch document string in scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(patch, workspace, { cwd: workspace });

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

    const result = await runPatchCommand(
      "-",
      workspace,
      { cwd: workspace },
      { readStdin: async () => patch },
    );

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand can read patch document from provided stdin stream", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");
    const stream = Readable.from([patch]);

    const result = await runPatchCommand(
      "-",
      workspace,
      { cwd: workspace },
      { stdinStream: stream },
    );

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand rejects empty patch document from stdin", async () => {
  await expect(runPatchCommand("-", ".", {}, { readStdin: async () => "" })).rejects.toThrow(
    "Patch document read from stdin was empty.",
  );
});

test("runPatchCommand supports dryRun flag", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const original = "const value = 1;\n";
    await writeFile(target, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(patch, workspace, { cwd: workspace, "dry-run": true });

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

    const result = await runPatchCommand(patch, workspace, { cwd: workspace, check: true });

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
      { interactive: true, cwd: workspace },
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
      { interactive: true, cwd: workspace },
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
      { interactive: true, cwd: workspace },
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

test("runPatchCommand interactive mode applies all remaining after 'all' choice", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const first = 1;\nconst second = 2;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    let calls = 0;
    const result = await runPatchCommand(
      patch,
      workspace,
      { interactive: true, cwd: workspace },
      {
        interactiveDecider: async () => {
          calls += 1;
          return "all";
        },
      },
    );

    expect(calls).toBe(1);
    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(2);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let first = 1;\nlet second = 2;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive mode stops on 'quit' without applying changes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const original = "const first = 1;\nconst second = 2;\n";
    await writeFile(target, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(
      patch,
      workspace,
      { interactive: true, cwd: workspace },
      {
        interactiveDecider: async () => "quit",
      },
    );

    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(0);
    expect(result.filesChanged).toBe(0);
    expect(await readFile(target, "utf8")).toBe(original);
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

test("runPatchCommand interactive resolves file-scoped targets without cwd collisions", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const cwd = path.join(workspace, "cwd");
    const scopeFile = path.join(workspace, "target.ts");
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(cwd, { recursive: true });

    const cwdFile = path.join(cwd, "target.ts");
    const original = "const value = 1;\n";
    await writeFile(cwdFile, original, "utf8");
    await writeFile(scopeFile, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(
      patch,
      scopeFile,
      { interactive: true, cwd },
      {
        interactiveDecider: async () => "yes",
      },
    );

    expect(result.filesChanged).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(cwdFile, "utf8")).toBe(original);
    expect(await readFile(scopeFile, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive fails when target file disappears after selection", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      runPatchCommand(
        patch,
        workspace,
        { interactive: true, cwd: workspace },
        {
          interactiveDecider: async () => {
            await rm(target, { force: true });
            return "yes";
          },
        },
      ),
    ).rejects.toThrow("Unable to resolve interactive patch target file");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runPatchCommand interactive rejects ambiguous target resolution within scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const cwd = path.join(workspace, "subdir");
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(cwd, { recursive: true });

    const scopeMatch = path.join(workspace, "sample.ts");
    const cwdShadow = path.join(cwd, "sample.ts");
    await writeFile(scopeMatch, "const value = 1;\n", "utf8");
    await writeFile(cwdShadow, "// shadow file\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      runPatchCommand(
        patch,
        workspace,
        { interactive: true, cwd },
        {
          interactiveDecider: async () => "yes",
        },
      ),
    ).rejects.toThrow("Ambiguous interactive patch target file");
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

test("runPatchCommand interactive mode requires TTY when no custom decider is provided", async () => {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return;
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      runPatchCommand(patch, workspace, {
        interactive: true,
        cwd: workspace,
      }),
    ).rejects.toThrow("Interactive mode requires a TTY stdin/stdout.");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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

test("validateSelectedOccurrences rejects out-of-bounds spans", () => {
  const source = "const a = 1;\n";

  expect(() =>
    validateSelectedOccurrences("sample.ts", source, [
      {
        start: 0,
        end: source.length + 1,
        line: 1,
        character: 1,
        matched: source,
        replacement: source,
        captures: {},
      },
    ]),
  ).toThrow("File changed during interactive patch selection");
});

test("validateSelectedOccurrences rejects stale matched content", () => {
  const source = "const a = 1;\n";

  expect(() =>
    validateSelectedOccurrences("sample.ts", source, [
      {
        start: 0,
        end: source.length,
        line: 1,
        character: 1,
        matched: "let a = 1;\n",
        replacement: "let a = 1;\n",
        captures: {},
      },
    ]),
  ).toThrow("File changed during interactive patch selection");
});

test("patchCommand flag parsers validate concurrency and verbose levels", () => {
  expect(() => patchCommandFlagParameters.concurrency.parse("0")).toThrow(
    "--concurrency must be a positive number",
  );
  expect(() => patchCommandFlagParameters.verbose.parse("-1")).toThrow(
    "--verbose must be a non-negative number",
  );

  expect(patchCommandFlagParameters.concurrency.parse("3.8")).toBe(3);
  expect(patchCommandFlagParameters.verbose.parse("2.9")).toBe(2);
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
      { interactive: true, cwd: workspace, concurrency: 3, verbose: 1 },
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

test("runPatchCommand interactive resolves scoped files before cwd collisions", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const cwd = path.join(workspace, "cwd");
    const scopeDir = path.join(workspace, "external", "src");
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await mkdir(scopeDir, { recursive: true });

    const cwdFile = path.join(cwd, "sample.ts");
    const scopedFile = path.join(scopeDir, "sample.ts");
    const original = "const value = 1;\n";

    await writeFile(cwdFile, original, "utf8");
    await writeFile(scopedFile, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await runPatchCommand(
      patch,
      scopeDir,
      { interactive: true, cwd },
      {
        interactiveDecider: async () => "yes",
      },
    );

    expect(result.filesChanged).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(cwdFile, "utf8")).toBe(original);
    expect(await readFile(scopedFile, "utf8")).toBe("let value = 1;\n");
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

test("formatPatchOutput escapes terminal control sequences in paths and lines", () => {
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
        file: "src/\u001b[31mevil.ts",
        matchCount: 1,
        replacementCount: 1,
        changed: true,
        byteDelta: 0,
        occurrences: [
          {
            start: 0,
            end: 18,
            line: 1,
            character: 1,
            matched: 'const msg = "\u001b[2J";',
            replacement: 'let msg = "\u001b[2J";',
            captures: {},
          },
        ],
      },
    ],
  };

  const output = formatPatchOutput(result, { color: false });

  expect(output).not.toContain("\u001b");
  expect(output).toContain("src/\\x1b[31mevil.ts");
  expect(output).toContain('-const msg = "\\x1b[2J";');
  expect(output).toContain('+let msg = "\\x1b[2J";');
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

test("patchCommand loader writes compact text output in process", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");
    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const execute = await resolvePatchCommandExecutor();
    let stdoutText = "";
    await execute.call(
      {
        process: {
          stdout: {
            write(s: string) {
              stdoutText += s;
            },
          },
        },
      },
      { cwd: workspace },
      patch,
      workspace,
    );

    expect(stdoutText).toContain("diff --git");
    expect(stdoutText).toContain("1 file changed, 1 replacement");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchCommand loader uses command context stdout isTTY for color output", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");
    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const execute = await resolvePatchCommandExecutor();
    let stdoutText = "";
    await execute.call(
      {
        process: {
          stdout: {
            isTTY: true,
            write(s: string) {
              stdoutText += s;
            },
          },
        },
      },
      { cwd: workspace },
      patch,
      workspace,
    );

    expect(stdoutText).toContain("diff --git");
    expect(stdoutText).toContain("\u001b[");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchCommand loader writes JSON output and passes --check when no replacements are needed", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, 'import { dot } from "./common.ts";\n', "utf8");
    const noOpPatch = ["-import{:[name]}from:[module];", "+import{:[name]}from:[module];"].join(
      "\n",
    );

    const execute = await resolvePatchCommandExecutor();
    let stdoutText = "";
    await execute.call(
      {
        process: {
          stdout: {
            write(s: string) {
              stdoutText += s;
            },
          },
        },
      },
      { cwd: workspace, json: true, check: true },
      noOpPatch,
      workspace,
    );

    const payload = JSON.parse(stdoutText) as SpatchResult;
    expect(payload.totalReplacements).toBe(0);
    expect(payload.filesChanged).toBe(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchCommand loader throws --check error in process when replacements are needed", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    await writeFile(target, "const value = 1;\n", "utf8");
    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");
    const execute = await resolvePatchCommandExecutor();

    await expect(
      execute.call(
        {
          process: {
            stdout: {
              write() {
                // Ignore captured output for check-mode error path.
              },
            },
          },
        },
        { cwd: workspace, check: true },
        patch,
        workspace,
      ),
    ).rejects.toThrow("Check failed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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
      cmd: [
        "bun",
        "run",
        "packages/spatch/src/cli.ts",
        patchFile,
        workspace,
        "--check",
        "--cwd",
        workspace,
      ],
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

test("cli --check exits zero when no replacements are needed", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "patch-command-"));

  try {
    const target = path.join(workspace, "sample.ts");
    const patchFile = path.join(workspace, "rule.spatch");
    await writeFile(target, 'import { dot } from "./common.ts";\n', "utf8");
    await writeFile(
      patchFile,
      ["-import{:[name]}from:[module];", "+import{:[name]}from:[module];", ""].join("\n"),
      "utf8",
    );

    const cli = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "packages/spatch/src/cli.ts",
        patchFile,
        workspace,
        "--check",
        "--cwd",
        workspace,
      ],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(cli.exitCode).toBe(0);
    expect(new TextDecoder().decode(cli.stderr)).toBe("");
    expect(await readFile(target, "utf8")).toBe('import { dot } from "./common.ts";\n');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
