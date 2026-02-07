import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSearchCommand } from "../search/search.ts";

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
