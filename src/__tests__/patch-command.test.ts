import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPatchCommand } from "../patch/patch.ts";

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
