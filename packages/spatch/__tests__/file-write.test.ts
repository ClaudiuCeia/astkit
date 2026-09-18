import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  commitTransaction,
  PartialCommitError,
  writeFileIfUnchangedAtomically,
  type FileWriteFs,
} from "../src/file-write.ts";

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

// --- commitTransaction ---

test("commitTransaction is a no-op for empty entries", async () => {
  await expect(commitTransaction([])).resolves.toBeUndefined();
});

test("commitTransaction writes all entries to real files", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-tx-"));

  try {
    const fileA = path.join(workspace, "a.ts");
    const fileB = path.join(workspace, "b.ts");
    await writeFile(fileA, "const a = 1;\n", "utf8");
    await writeFile(fileB, "const b = 2;\n", "utf8");

    await commitTransaction([
      {
        filePath: fileA,
        originalText: "const a = 1;\n",
        rewrittenText: "let a = 1;\n",
        encoding: "utf8",
        operationName: "test",
      },
      {
        filePath: fileB,
        originalText: "const b = 2;\n",
        rewrittenText: "let b = 2;\n",
        encoding: "utf8",
        operationName: "test",
      },
    ]);

    expect(await readFile(fileA, "utf8")).toBe("let a = 1;\n");
    expect(await readFile(fileB, "utf8")).toBe("let b = 2;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("commitTransaction commits in deterministic path order regardless of input order", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-tx-"));

  try {
    const fileA = path.join(workspace, "a.ts");
    const fileZ = path.join(workspace, "z.ts");
    await writeFile(fileA, "before\n", "utf8");
    await writeFile(fileZ, "before\n", "utf8");

    const commitOrder: string[] = [];
    const mockFs: FileWriteFs = {
      readFile: async (p) => readFile(p, "utf8"),
      stat: async (_p) => ({ mode: 0o644 }),
      writeFile: async (p, data, opts) => {
        writeFile(p, data, opts);
      },
      rename: async (oldP, newP) => {
        commitOrder.push(newP);
        const { rename } = await import("node:fs/promises");
        await rename(oldP, newP);
      },
      rm: async (p, opts) => {
        const { rm } = await import("node:fs/promises");
        await rm(p, opts);
      },
    };

    // Provide entries in z-first order; expect commit to be a-first.
    await commitTransaction(
      [
        {
          filePath: fileZ,
          originalText: "before\n",
          rewrittenText: "after-z\n",
          encoding: "utf8",
          operationName: "test",
        },
        {
          filePath: fileA,
          originalText: "before\n",
          rewrittenText: "after-a\n",
          encoding: "utf8",
          operationName: "test",
        },
      ],
      { fs: mockFs },
    );

    expect(commitOrder[0]).toBe(fileA);
    expect(commitOrder[1]).toBe(fileZ);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("commitTransaction preflights all files before committing any (stale preflight)", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "spatch-tx-"));

  try {
    const fileA = path.join(workspace, "a.ts");
    const fileB = path.join(workspace, "b.ts");
    await writeFile(fileA, "const a = 1;\n", "utf8");
    await writeFile(fileB, "stale content\n", "utf8"); // b is already stale

    await expect(
      commitTransaction([
        {
          filePath: fileA,
          originalText: "const a = 1;\n",
          rewrittenText: "let a = 1;\n",
          encoding: "utf8",
          operationName: "test",
        },
        {
          filePath: fileB,
          originalText: "const b = 2;\n", // won't match "stale content"
          rewrittenText: "let b = 2;\n",
          encoding: "utf8",
          operationName: "test",
        },
      ]),
    ).rejects.toThrow("File changed during test");

    // fileA must not have been written because b failed preflight.
    expect(await readFile(fileA, "utf8")).toBe("const a = 1;\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("commitTransaction rolls back committed files on commit failure", async () => {
  // fileA: /a.ts — commits successfully
  // fileB: /b.ts — commit (rename) throws
  // rollback must restore fileA to its originalText

  const renameError = new Error("disk full");
  let renameCount = 0;
  const fileContents = new Map<string, string>([
    ["/a.ts", "const a = 1;\n"],
    ["/b.ts", "const b = 2;\n"],
  ]);

  const mockFs: FileWriteFs = {
    readFile: async (p, _enc) => {
      const content = fileContents.get(p);
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
    stat: async () => ({ mode: 0o644 }),
    writeFile: async (p, data) => {
      fileContents.set(p, data);
    },
    rename: async (oldP, newP) => {
      renameCount += 1;
      const data = fileContents.get(oldP) ?? "";
      if (renameCount === 2) {
        // Second rename (fileB) fails — first already committed.
        fileContents.delete(oldP);
        throw renameError;
      }
      fileContents.set(newP, data);
      fileContents.delete(oldP);
    },
    rm: async (p) => {
      fileContents.delete(p);
    },
  };

  await expect(
    commitTransaction(
      [
        {
          filePath: "/a.ts",
          originalText: "const a = 1;\n",
          rewrittenText: "let a = 1;\n",
          encoding: "utf8",
          operationName: "test",
        },
        {
          filePath: "/b.ts",
          originalText: "const b = 2;\n",
          rewrittenText: "let b = 2;\n",
          encoding: "utf8",
          operationName: "test",
        },
      ],
      { fs: mockFs },
    ),
  ).rejects.toThrow("disk full");

  // fileA must be rolled back to original.
  expect(fileContents.get("/a.ts")).toBe("const a = 1;\n");
  // fileB was not committed (rename threw), so content is unchanged.
  expect(fileContents.get("/b.ts")).toBe("const b = 2;\n");
});

test("commitTransaction throws PartialCommitError when rollback write fails", async () => {
  // fileA commits, fileB commit fails, fileA rollback rename also fails.
  // renameCount=1: fileA commit (succeed)
  // renameCount=2: fileB commit (fail - disk full)
  // renameCount=3: fileA rollback (fail - rollback rename failed)
  let renameCount = 0;
  const fileContents = new Map<string, string>([
    ["/a.ts", "const a = 1;\n"],
    ["/b.ts", "const b = 2;\n"],
  ]);

  const mockFs: FileWriteFs = {
    readFile: async (p) => {
      const content = fileContents.get(p);
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
    stat: async () => ({ mode: 0o644 }),
    writeFile: async (p, data) => {
      fileContents.set(p, data);
    },
    rename: async (oldP, newP) => {
      renameCount += 1;
      const data = fileContents.get(oldP) ?? "";
      fileContents.delete(oldP);
      if (renameCount === 2) {
        // fileB commit rename fails.
        throw new Error("disk full");
      }
      if (renameCount === 3) {
        // fileA rollback rename fails.
        throw new Error("rollback rename failed");
      }
      fileContents.set(newP, data);
    },
    rm: async (p) => {
      fileContents.delete(p);
    },
  };

  const error = await commitTransaction(
    [
      {
        filePath: "/a.ts",
        originalText: "const a = 1;\n",
        rewrittenText: "let a = 1;\n",
        encoding: "utf8",
        operationName: "test",
      },
      {
        filePath: "/b.ts",
        originalText: "const b = 2;\n",
        rewrittenText: "let b = 2;\n",
        encoding: "utf8",
        operationName: "test",
      },
    ],
    { fs: mockFs },
  ).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(PartialCommitError);
  const partialError = error as PartialCommitError;
  expect(partialError.affectedFiles).toEqual(["/a.ts"]);
});

test("commitTransaction skips rollback for concurrently edited files and reports them", async () => {
  // fileA commits, fileB fails, then fileA is concurrently edited before rollback.
  let renameCount = 0;
  const fileContents = new Map<string, string>([
    ["/a.ts", "const a = 1;\n"],
    ["/b.ts", "const b = 2;\n"],
  ]);

  const mockFs: FileWriteFs = {
    readFile: async (p) => {
      const content = fileContents.get(p);
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
    stat: async () => ({ mode: 0o644 }),
    writeFile: async (p, data) => {
      fileContents.set(p, data);
    },
    rename: async (oldP, newP) => {
      renameCount += 1;
      const data = fileContents.get(oldP) ?? "";
      fileContents.delete(oldP);
      if (renameCount === 2) {
        // Second rename (fileB) fails — fileA already committed.
        throw new Error("disk full");
      }
      // First rename committed fileA. Simulate concurrent external edit.
      if (newP === "/a.ts") {
        fileContents.set(newP, "/* concurrent edit */\nlet a = 1;\n");
      } else {
        fileContents.set(newP, data);
      }
    },
    rm: async (p) => {
      fileContents.delete(p);
    },
  };

  const error = await commitTransaction(
    [
      {
        filePath: "/a.ts",
        originalText: "const a = 1;\n",
        rewrittenText: "let a = 1;\n",
        encoding: "utf8",
        operationName: "test",
      },
      {
        filePath: "/b.ts",
        originalText: "const b = 2;\n",
        rewrittenText: "let b = 2;\n",
        encoding: "utf8",
        operationName: "test",
      },
    ],
    { fs: mockFs },
  ).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(PartialCommitError);
  const partialError = error as PartialCommitError;
  expect(partialError.affectedFiles).toEqual(["/a.ts"]);

  // The concurrent edit must be preserved — not overwritten with rollback content.
  expect(fileContents.get("/a.ts")).toBe("/* concurrent edit */\nlet a = 1;\n");
});

test("PartialCommitError sorts affectedFiles deterministically", () => {
  const err = new PartialCommitError(["/z/file.ts", "/a/file.ts", "/m/file.ts"]);
  expect(err.affectedFiles).toEqual(["/a/file.ts", "/m/file.ts", "/z/file.ts"]);
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe("PartialCommitError");
  expect(err.message).toContain("3 file(s)");
});
