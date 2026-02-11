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
