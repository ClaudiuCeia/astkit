import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { searchProject } from "../sgrep/sgrep.ts";

test("searchProject finds structural matches across scoped files", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(
      path.join(workspace, "alpha.ts"),
      "const one = 1;\nconst two = 2;\n",
      "utf8",
    );
    await writeFile(path.join(workspace, "beta.ts"), "const sum = one + two;\n", "utf8");
    await writeFile(path.join(workspace, "notes.md"), "const ignored = true;\n", "utf8");

    const result = await searchProject("const :[name] = :[value];", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.filesScanned).toBe(2);
    expect(result.filesMatched).toBe(2);
    expect(result.totalMatches).toBe(3);
    expect(result.files[0]?.file).toBe("alpha.ts");
    expect(result.files[0]?.matches[0]?.captures).toEqual({
      name: "one",
      value: "1",
    });
    expect(result.files[0]?.matches[0]?.line).toBe(1);
    expect(result.files[0]?.matches[0]?.character).toBe(1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject enforces repeated metavariable equality", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(
      path.join(workspace, "math.ts"),
      "const a = foo + foo;\nconst b = foo + bar;\n",
      "utf8",
    );

    const result = await searchProject(":[x] + :[x];", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.matches[0]?.captures).toEqual({ x: "foo" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject supports regex-constrained metavariables", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(
      path.join(workspace, "values.ts"),
      "const lower = 1;\nconst Upper = 2;\nconst other = text;\n",
      "utf8",
    );

    const result = await searchProject(
      "const :[name~[a-z]+] = :[value~\\d+];",
      {
        cwd: workspace,
        scope: ".",
      },
    );

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.matches[0]?.captures).toEqual({
      name: "lower",
      value: "1",
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject skips unbalanced captures", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(
      path.join(workspace, "calls.ts"),
      "const a = run((x);\nconst b = run((x));\n",
      "utf8",
    );

    const result = await searchProject("run(:[arg]);", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.matches[0]?.captures).toEqual({ arg: "(x)" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject resolves pattern input from file path using cwd", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "const value = 1;\n", "utf8");
    await writeFile(path.join(workspace, "rule.sgrep"), "const :[name] = :[value];\n", "utf8");

    const result = await searchProject("rule.sgrep", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.file).toBe("sample.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject honors default excluded directories", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(path.join(workspace, "main.ts"), "const root = 1;\n", "utf8");
    await mkdir(path.join(workspace, "node_modules"), { recursive: true });
    await writeFile(path.join(workspace, "node_modules", "dep.ts"), "const dep = 1;\n", "utf8");

    const result = await searchProject("const :[name] = :[value];", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.filesScanned).toBe(1);
    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.file).toBe("main.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject accepts single-file scope", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    const target = path.join(workspace, "target.ts");
    const other = path.join(workspace, "other.ts");
    await writeFile(target, "const target = true;\n", "utf8");
    await writeFile(other, "const other = true;\n", "utf8");

    const result = await searchProject("const :[name] = true;", {
      cwd: workspace,
      scope: "target.ts",
    });

    expect(result.filesScanned).toBe(1);
    expect(result.filesMatched).toBe(1);
    expect(result.totalMatches).toBe(1);
    expect(result.files[0]?.file).toBe("target.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject returns empty file list when no matches are found", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(path.join(workspace, "sample.ts"), "let value = 1;\n", "utf8");

    const result = await searchProject("const :[name] = :[value];", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.filesScanned).toBe(1);
    expect(result.filesMatched).toBe(0);
    expect(result.totalMatches).toBe(0);
    expect(result.files).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("searchProject throws on empty pattern", async () => {
  let thrown: unknown = null;

  try {
    await searchProject("", { scope: "." });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
});

test("searchProject supports ellipsis wildcard", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "sgrep-"));

  try {
    await writeFile(
      path.join(workspace, "calls.ts"),
      "foo(first, second, third);\nfoo(alpha, beta, gamma, delta);\nfoo(one, two);\n",
      "utf8",
    );

    const result = await searchProject("foo(:[x], ..., :[y]);", {
      cwd: workspace,
      scope: ".",
    });

    expect(result.totalMatches).toBe(2);
    expect(result.files[0]?.matches[0]?.captures).toEqual({
      x: "first",
      y: "third",
    });
    expect(result.files[0]?.matches[1]?.captures).toEqual({
      x: "alpha",
      y: "delta",
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
