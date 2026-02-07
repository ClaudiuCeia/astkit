import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Chalk } from "chalk";
import { formatSearchOutput, runSearchCommand } from "../search/search.ts";
import type { SgrepResult } from "../sgrep/types.ts";

test("runSearchCommand finds matches for inline pattern", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "search-command-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "const value = 1;\n", "utf8");

    const result = await runSearchCommand("const :[name] = :[value];", ".", {
      cwd: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.filesMatched).toBe(1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runSearchCommand resolves pattern file from cwd", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "search-command-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "const value = 1;\n", "utf8");
    await writeFile(path.join(workspace, "rule.sgrep"), "const :[name] = :[value];\n", "utf8");

    const result = await runSearchCommand("rule.sgrep", ".", { cwd: workspace });

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.file).toBe("sample.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runSearchCommand defaults scope to current directory", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "search-command-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "const value = 1;\n", "utf8");

    const result = await runSearchCommand("const :[name] = :[value];", undefined, {
      cwd: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.filesScanned).toBe(1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runSearchCommand can disable isomorphism expansion", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "search-command-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "const total = 1 + value;\n", "utf8");

    const result = await runSearchCommand("const total = :[x] + 1;", ".", {
      cwd: workspace,
      "no-isomorphisms": true,
    });

    expect(result.totalMatches).toBe(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runSearchCommand matches object literal key-order isomorphism", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "search-command-"));

  try {
    await writeFile(
      path.join(workspace, "sample.ts"),
      "const map = { bar: second, foo: first };\n",
      "utf8",
    );

    const result = await runSearchCommand(
      "const map = { foo: :[x], bar: :[y] };",
      ".",
      { cwd: workspace },
    );

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.matches[0]?.captures).toEqual({
      x: "first",
      y: "second",
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("formatSearchOutput renders compact file and line output", () => {
  const result: SgrepResult = {
    scope: "/tmp/workspace/src",
    pattern: "let :[x] = :[n]",
    filesScanned: 1,
    filesMatched: 1,
    totalMatches: 2,
    elapsedMs: 1,
    files: [
      {
        file: "src/sample.ts",
        matchCount: 2,
        matches: [
          {
            start: 120,
            end: 137,
            line: 123,
            character: 5,
            matched: "    let foo = 42;",
            captures: {
              x: "foo",
              n: "42",
            },
          },
          {
            start: 200,
            end: 230,
            line: 200,
            character: 1,
            matched: "let bar = compute(\n  value,\n);",
            captures: {
              x: "bar",
              n: "compute(\n  value,\n)",
            },
          },
        ],
      },
    ],
  };

  expect(formatSearchOutput(result)).toBe(
    ["//src/sample.ts", "123:     let foo = 42;", "200: let bar = compute( ..."].join(
      "\n",
    ),
  );
});

test("formatSearchOutput is empty when there are no matches", () => {
  const result: SgrepResult = {
    scope: "/tmp/workspace/src",
    pattern: "let :[x] = :[n]",
    filesScanned: 1,
    filesMatched: 0,
    totalMatches: 0,
    elapsedMs: 1,
    files: [],
  };

  expect(formatSearchOutput(result)).toBe("");
});

test("formatSearchOutput colors distinct variables with different colors", () => {
  const result: SgrepResult = {
    scope: "/tmp/workspace/src",
    pattern: "let :[x] = :[n]",
    filesScanned: 1,
    filesMatched: 1,
    totalMatches: 1,
    elapsedMs: 1,
    files: [
      {
        file: "src/sample.ts",
        matchCount: 2,
        matches: [
          {
            start: 0,
            end: 13,
            line: 1,
            character: 1,
            matched: "let foo = 42;",
            captures: {
              x: "foo",
              n: "42",
            },
          },
          {
            start: 14,
            end: 27,
            line: 2,
            character: 1,
            matched: "let bar = 7;",
            captures: {
              x: "bar",
              n: "7",
            },
          },
          {
            start: 28,
            end: 55,
            line: 3,
            character: 1,
            matched: "let baz = compute(\n  value,\n);",
            captures: {
              x: "baz",
              n: "compute(\n  value,\n)",
            },
          },
        ],
      },
    ],
  };

  const chalkInstance = new Chalk({ level: 1 });
  const output = formatSearchOutput(result, {
    color: true,
    chalkInstance,
  });

  expect(output).toContain("\u001b[");
  const fooCode = output.match(/(\u001b\[[0-9;]*m)foo\u001b\[[0-9;]*m/)?.[1];
  const barCode = output.match(/(\u001b\[[0-9;]*m)bar\u001b\[[0-9;]*m/)?.[1];
  const fortyTwoCode = output.match(/(\u001b\[[0-9;]*m)42\u001b\[[0-9;]*m/)?.[1];
  const sevenCode = output.match(/(\u001b\[[0-9;]*m)7\u001b\[[0-9;]*m/)?.[1];
  const computeCode = output.match(
    /(\u001b\[[0-9;]*m)compute\(\u001b\[[0-9;]*m/,
  )?.[1];

  expect(fooCode).toBeDefined();
  expect(barCode).toBe(fooCode);
  expect(fortyTwoCode).toBeDefined();
  expect(sevenCode).toBe(fortyTwoCode);
  expect(computeCode).toBe(fortyTwoCode);
  expect(fooCode).not.toBe(fortyTwoCode);
});
