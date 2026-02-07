import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { patchProject } from "../spatch/spatch.ts";

test("patchProject rewrites matching files in directory scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const alpha = path.join(workspace, "alpha.ts");
    const beta = path.join(workspace, "beta.ts");
    const markdown = path.join(workspace, "notes.md");

    await writeFile(alpha, "const one = 1;\nconst two = 2;\n", "utf8");
    await writeFile(beta, "const sum = one + two;\n", "utf8");
    await writeFile(markdown, "const untouched = true;\n", "utf8");

    const patch = [
      "-const :[name] = :[value];",
      "+let :[name] = :[value];",
    ].join("\n");

    const result = await patchProject(patch, { scope: workspace });

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

    const patch = [
      "-const :[name] = :[value];",
      "+let :[name] = :[value];",
    ].join("\n");

    const result = await patchProject(patch, {
      scope: workspace,
      dryRun: true,
    });

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

    const patch = ["-:[x] + :[x];", "+double(:[x]);"].join("\n");

    const result = await patchProject(patch, {
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

    const patch = ["-const :[name] = true;", "+let :[name] = true;"].join("\n");

    const result = await patchProject(patch, {
      scope: target,
    });

    expect(result.filesScanned).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(target, "utf8")).toBe("let target = true;\n");
    expect(await readFile(other, "utf8")).toBe("const other = true;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject supports regex-constrained holes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "values.ts");
    await writeFile(
      file,
      "const lower = 1;\nconst Upper = 2;\nconst other = text;\n",
      "utf8",
    );

    const patch = [
      "-const :[name~[a-z]+] = :[value~\\d+];",
      "+let :[name] = Number(:[value]);",
    ].join("\n");

    const result = await patchProject(patch, {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      "let lower = Number(1);\nconst Upper = 2;\nconst other = text;\n",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject accepts patch document syntax (+/- lines)", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "wrapper.ts");
    await writeFile(
      file,
      [
        "function wrap() {",
        "  const value = 1;",
        "  return value;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const oneFilePatch = [
      "function wrap() {",
      "-  const value = 1;",
      "+  let value = 1;",
      "  return value;",
      "}",
      "",
    ].join("\n");

    const result = await patchProject(oneFilePatch, {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      [
        "function wrap() {",
        "  let value = 1;",
        "  return value;",
        "}",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject supports escaped markers", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "symbols.ts");
    await writeFile(file, "-keep\n+keep\nold\n", "utf8");

    const oneFilePatch = ["\\-keep", "\\+keep", "-old", "+new", ""].join(
      "\n",
    );

    const result = await patchProject(oneFilePatch, {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(await readFile(file, "utf8")).toBe("-keep\n+keep\nnew\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject accepts a patch file path", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const patchFile = path.join(workspace, "rule.spatch");

    await writeFile(file, "const value = 1;\n", "utf8");
    await writeFile(
      patchFile,
      ["-const :[name] = :[value];", "+let :[name] = :[value];", ""].join("\n"),
      "utf8",
    );

    const result = await patchProject("rule.spatch", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.totalMatches).toBe(1);
    expect(await readFile(file, "utf8")).toBe("let value = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject skips unbalanced captures", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "calls.ts");
    await writeFile(file, "const a = run((x);\nconst b = run((x));\n", "utf8");

    const patch = ["-run(:[arg]);", "+exec(:[arg]);"].join("\n");

    const result = await patchProject(patch, {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      "const a = run((x);\nconst b = exec((x));\n",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject throws for unknown replacement holes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    await writeFile(file, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[missing] = :[value];"].join(
      "\n",
    );

    let thrown: unknown = null;
    try {
      await patchProject(patch, {
        scope: workspace,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject supports ellipsis wildcard", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "calls.ts");
    await writeFile(
      file,
      "foo(first, second, third);\nfoo(one, two);\n",
      "utf8",
    );

    const patch = ["-foo(:[x], ...);", "+bar(:[x], ...);"].join("\n");

    const result = await patchProject(patch, {
      scope: workspace,
    });

    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(2);
    expect(await readFile(file, "utf8")).toBe(
      "bar(first, second, third);\nbar(one, two);\n",
    );
    expect(result.files[0]?.occurrences[0]?.captures).toEqual({ x: "first" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
