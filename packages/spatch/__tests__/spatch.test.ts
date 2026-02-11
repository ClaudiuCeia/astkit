import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { patchProject } from "../src/spatch.ts";

test("patchProject rewrites matching files in directory scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const alpha = path.join(workspace, "alpha.ts");
    const beta = path.join(workspace, "beta.ts");
    const markdown = path.join(workspace, "notes.md");

    await writeFile(alpha, "const one = 1;\nconst two = 2;\n", "utf8");
    await writeFile(beta, "const sum = one + two;\n", "utf8");
    await writeFile(markdown, "const untouched = true;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, { cwd: workspace, scope: workspace });

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

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
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

test("patchProject no-op rewrite preserves source formatting and reports zero replacements", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const original = 'import { dot } from "./common.ts";\n';
    await writeFile(file, original, "utf8");

    const patch = ["-import{:[name]}from:[module];", "+import{:[name]}from:[module];"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.totalReplacements).toBe(0);
    expect(result.filesChanged).toBe(0);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject aborts non-interactive apply when file changes before write", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const original = "const value = 1;\n";
    const externallyMutated = "/* external edit */\nconst value = 1;\n";
    await writeFile(file, original, "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");
    let mutated = false;

    await expect(
      patchProject(patch, {
        cwd: workspace,
        scope: workspace,
        // Internal test hook: mutate after read, before atomic write.
        __beforeWriteFile: async ({ filePath }: { filePath: string }) => {
          if (mutated) {
            return;
          }
          mutated = true;
          await writeFile(filePath, externallyMutated, "utf8");
        },
      } as any),
    ).rejects.toThrow("File changed during non-interactive patch apply");

    expect(await readFile(file, "utf8")).toBe(externallyMutated);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject atomic write leaves no temporary files behind", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    await writeFile(file, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");
    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalReplacements).toBe(1);
    expect(await readFile(file, "utf8")).toBe("let value = 1;\n");

    const entries = await readdir(workspace);
    expect(entries.some((entry) => entry.includes(".spatch-"))).toBe(false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject verbose=2 logs slow-file entries", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    await writeFile(file, "const value = 1;\n", "utf8");
    const logs: string[] = [];
    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
      verbose: 2,
      logger: (line) => logs.push(line),
    });

    expect(result.totalReplacements).toBe(1);
    expect(logs.some((line) => line.includes("[spatch] slowFile"))).toBe(true);
    expect(logs.some((line) => line.includes("[spatch] summary"))).toBe(true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject rejects scope outside nearest git repository root", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));
  const outside = await mkdtemp(path.join(tmpdir(), "spatch-outside-"));

  try {
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await writeFile(path.join(workspace, "inside.ts"), "const inside = 1;\n", "utf8");
    await writeFile(path.join(outside, "outside.ts"), "const outside = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      patchProject(patch, {
        cwd: workspace,
        scope: outside,
      }),
    ).rejects.toThrow("Scope resolves outside repository root");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("patchProject rejects symlink scope escaping nearest git repository root", async () => {
  if (process.platform === "win32") {
    return;
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));
  const outside = await mkdtemp(path.join(tmpdir(), "spatch-outside-"));

  try {
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await writeFile(path.join(outside, "outside.ts"), "const outside = 1;\n", "utf8");
    await symlink(outside, path.join(workspace, "leak"));

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      patchProject(patch, {
        cwd: workspace,
        scope: "leak",
      }),
    ).rejects.toThrow("Scope resolves outside repository root");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("patchProject rejects scope outside cwd when git repository root is unavailable", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));
  const outside = await mkdtemp(path.join(tmpdir(), "spatch-outside-"));

  try {
    const cwd = path.join(workspace, "sandbox");
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(workspace, "inside.ts"), "const inside = 1;\n", "utf8");
    await writeFile(path.join(outside, "outside.ts"), "const outside = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    await expect(
      patchProject(patch, {
        cwd,
        scope: outside,
      }),
    ).rejects.toThrow("Scope resolves outside cwd");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("patchProject enforces repeated hole equality", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "math.ts");
    await writeFile(file, "const a = foo + foo;\nconst b = foo + bar;\n", "utf8");

    const patch = ["-:[x] + :[x];", "+double(:[x]);"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.totalReplacements).toBe(1);
    expect(await readFile(file, "utf8")).toBe("const a = double(foo);\nconst b = foo + bar;\n");
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
      cwd: workspace,
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

test("patchProject reports scope-relative file paths when scope is outside cwd", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const srcDir = path.join(workspace, "src");
    const otherCwd = path.join(workspace, "sandbox");
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(otherCwd, { recursive: true });
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "sample.ts"), "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, { cwd: otherCwd, scope: srcDir });

    expect(result.files.length).toBe(1);
    expect(result.files[0]?.file).toBe("sample.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject keeps cwd-relative file paths when scope is within cwd", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const srcDir = path.join(workspace, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, "sample.ts"), "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: "src",
    });

    expect(result.files.length).toBe(1);
    expect(result.files[0]?.file).toBe(path.join("src", "sample.ts"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject supports regex-constrained holes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "values.ts");
    await writeFile(file, "const lower = 1;\nconst Upper = 2;\nconst other = text;\n", "utf8");

    const patch = [
      "-const :[name~[a-z]+] = :[value~\\d+];",
      "+let :[name] = Number(:[value]);",
    ].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
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
      ["function wrap() {", "  const value = 1;", "  return value;", "}", ""].join("\n"),
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
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.filesChanged).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      ["function wrap() {", "  let value = 1;", "  return value;", "}", ""].join("\n"),
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

    const oneFilePatch = ["\\-keep", "\\+keep", "-old", "+new", ""].join("\n");

    const result = await patchProject(oneFilePatch, {
      cwd: workspace,
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
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(1);
    expect(await readFile(file, "utf8")).toBe("const a = run((x);\nconst b = exec((x));\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject throws for unknown replacement holes", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "sample.ts");
    await writeFile(file, "const value = 1;\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[missing] = :[value];"].join("\n");

    let thrown: unknown = null;
    try {
      await patchProject(patch, {
        cwd: workspace,
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
    await writeFile(file, "foo(first, second, third);\nfoo(one, two);\n", "utf8");

    const patch = ["-foo(:[x], ...);", "+bar(:[x], ...);"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(2);
    expect(await readFile(file, "utf8")).toBe("bar(first, second, third);\nbar(one, two);\n");
    expect(result.files[0]?.occurrences[0]?.captures).toEqual({ x: "first" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("patchProject rewrites CRLF files with LF patch documents", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-"));

  try {
    const file = path.join(workspace, "windows.ts");
    await writeFile(file, "const value = 1;\r\nconst next = 2;\r\n", "utf8");

    const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

    const result = await patchProject(patch, {
      cwd: workspace,
      scope: workspace,
    });

    expect(result.totalMatches).toBe(2);
    expect(result.totalReplacements).toBe(2);
    expect(await readFile(file, "utf8")).toBe("let value = 1;\r\nlet next = 2;\r\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
