import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { patchProject } from "./spatch.ts";

test("patchProject rewrites matching files in directory scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const alpha = path.join(workspace, "alpha.ts");
    const beta = path.join(workspace, "beta.ts");
    const markdown = path.join(workspace, "notes.md");

    await writeFile(alpha, "const one = 1;\nconst two = 2;\n", "utf8");
    await writeFile(beta, "const sum = one + two;\n", "utf8");
    await writeFile(markdown, "const untouched = true;\n", "utf8");

    const result = await patchProject(
      "const :[name] = :[value];",
      "let :[name] = :[value];",
      { scope: workspace },
    );

    expect(result.filesScanned).toBe(2);
    expect(result.filesMatched).toBe(2);
    expect(result.filesChanged).toBe(2);
    expect(result.totalMatches).toBe(3);
    expect(result.totalReplacements).toBe(3);

    expect(await readFile(alpha, "utf8")).toBe("let one = 1;\nlet two = 2;\n");
    expect(await readFile(beta, "utf8")).toBe("let sum = one + two;\n");
    expect(await readFile(markdown, "utf8")).toBe("const untouched = true;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject dry run does not write files", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const original = "const value = 1;\n";
    await writeFile(file, original, "utf8");

    const result = await patchProject(
      "const :[name] = :[value];",
      "let :[name] = :[value];",
      {
        scope: workspace,
        dryRun: true,
      },
    );

    expect(result.filesChanged).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject enforces repeated hole equality", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "math.ts");
    await writeFile(file, "const a = foo + foo;\nconst b = foo + bar;\n", "utf8");

    const result = await patchProject(":[x] + :[x];", "double(:[x]);", {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      "const a = double(foo);\nconst b = foo + bar;\n",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject accepts single-file scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const target = path.join(workspace, "target.ts");
    const other = path.join(workspace, "other.ts");
    await writeFile(target, "const target = true;\n", "utf8");
    await writeFile(other, "const other = true;\n", "utf8");

    const result = await patchProject(
      "const :[name] = true;",
      "let :[name] = true;",
      {
        scope: target,
      },
    );

    expect(result.filesScanned).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let target = true;\n");
    expect(await readFile(other, "utf8")).toBe("const other = true;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
