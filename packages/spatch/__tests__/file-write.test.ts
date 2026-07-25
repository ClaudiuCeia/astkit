import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFileIfUnchangedAtomically } from "../src/file-write.ts";

test("writeFileIfUnchangedAtomically writes rewritten content", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-write-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const originalText = "const value = 1;\n";
    const rewrittenText = "let value = 1;\n";
    await writeFile(file, originalText, "utf8");

    await writeFileIfUnchangedAtomically({
      filePath: file,
      originalText,
      rewrittenText,
      encoding: "utf8",
      operationName: "interactive patch apply",
    });

    expect(await readFile(file, "utf8")).toBe(rewrittenText);
    const entries = await readdir(workspace);
    expect(entries.some((entry) => entry.includes(".spatch-"))).toBe(false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("writeFileIfUnchangedAtomically rejects stale content", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-write-"));

  try {
    const file = path.join(workspace, "sample.ts");
    const originalText = "const value = 1;\n";
    const externallyMutatedText = "const value = 2;\n";
    await writeFile(file, originalText, "utf8");
    await writeFile(file, externallyMutatedText, "utf8");

    await expect(
      writeFileIfUnchangedAtomically({
        filePath: file,
        originalText,
        rewrittenText: "let value = 1;\n",
        encoding: "utf8",
        operationName: "interactive patch apply",
      }),
    ).rejects.toThrow("File changed during interactive patch apply");

    expect(await readFile(file, "utf8")).toBe(externallyMutatedText);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("writeFileIfUnchangedAtomically cleans up temp file when rename fails", async () => {
  const events: string[] = [];

  await expect(
    writeFileIfUnchangedAtomically({
      filePath: "/tmp/example.ts",
      originalText: "const value = 1;\n",
      rewrittenText: "let value = 1;\n",
      encoding: "utf8",
      operationName: "non-interactive patch apply",
      fs: {
        readFile: async () => "const value = 1;\n",
        stat: async () => ({ mode: 0o644 }),
        writeFile: async () => {
          events.push("write");
        },
        rename: async () => {
          throw new Error("rename boom");
        },
        rm: async () => {
          events.push("rm");
        },
      },
    }),
  ).rejects.toThrow("rename boom");

  expect(events).toEqual(["write", "rm"]);
});

test("writeFileIfUnchangedAtomically cleans up a partially written temp file", async () => {
  const events: string[] = [];

  await expect(
    writeFileIfUnchangedAtomically({
      filePath: "/tmp/example.ts",
      originalText: "before",
      rewrittenText: "after",
      encoding: "utf8",
      operationName: "patch apply",
      fs: {
        readFile: async () => "before",
        stat: async () => ({ mode: 0o644 }),
        writeFile: async () => {
          events.push("write");
          throw new Error("disk full");
        },
        rename: async () => {
          events.push("rename");
        },
        rm: async () => {
          events.push("rm");
        },
      },
    }),
  ).rejects.toThrow("disk full");

  expect(events).toEqual(["write", "rm"]);
});

test("writeFileIfUnchangedAtomically detects edits made while preparing the temp file", async () => {
  let readCount = 0;
  const events: string[] = [];

  await expect(
    writeFileIfUnchangedAtomically({
      filePath: "/tmp/example.ts",
      originalText: "before",
      rewrittenText: "after",
      encoding: "utf8",
      operationName: "patch apply",
      fs: {
        readFile: async () => (++readCount === 1 ? "before" : "external edit"),
        stat: async () => ({ mode: 0o644 }),
        writeFile: async () => {
          events.push("write");
        },
        rename: async () => {
          events.push("rename");
        },
        rm: async () => {
          events.push("rm");
        },
      },
    }),
  ).rejects.toThrow("File changed during patch apply");

  expect(events).toEqual(["write", "rm"]);
});

test("writeFileIfUnchangedAtomically preserves unrelated read errors", async () => {
  const permissionError = Object.assign(new Error("permission denied"), { code: "EACCES" });

  await expect(
    writeFileIfUnchangedAtomically({
      filePath: "/tmp/example.ts",
      originalText: "before",
      rewrittenText: "after",
      encoding: "utf8",
      operationName: "patch apply",
      fs: {
        readFile: async () => Promise.reject(permissionError),
        stat: async () => ({ mode: 0o644 }),
        writeFile: async () => undefined,
        rename: async () => undefined,
        rm: async () => undefined,
      },
    }),
  ).rejects.toBe(permissionError);
});
