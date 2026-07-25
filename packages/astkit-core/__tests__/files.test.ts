import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { collectPatchableFiles } from "../src/files.ts";

test("collectPatchableFiles returns deterministic source files and skips excluded directories", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "astkit-files-"));

  try {
    await mkdir(path.join(workspace, "src"));
    await mkdir(path.join(workspace, "dist"));
    await writeFile(path.join(workspace, "src", "z.ts"), "", "utf8");
    await writeFile(path.join(workspace, "src", "a.JS"), "", "utf8");
    await writeFile(path.join(workspace, "src", "ignored.txt"), "", "utf8");
    await writeFile(path.join(workspace, "dist", "generated.ts"), "", "utf8");

    const files = await collectPatchableFiles({ cwd: workspace, scope: "." });

    expect(files.map((file) => path.relative(workspace, file))).toEqual(["src/a.JS", "src/z.ts"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("collectPatchableFiles normalizes custom extensions", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "astkit-files-"));

  try {
    const file = path.join(workspace, "module.VUE");
    await writeFile(file, "", "utf8");

    expect(
      await collectPatchableFiles({ cwd: workspace, scope: ".", extensions: [" vue "] }),
    ).toEqual([file]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("collectPatchableFiles rejects an explicit symbolic-link scope", async () => {
  if (process.platform === "win32") {
    return;
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "astkit-files-"));

  try {
    const target = path.join(workspace, "target.ts");
    const link = path.join(workspace, "link.ts");
    await writeFile(target, "", "utf8");
    await symlink(target, link);

    expect(collectPatchableFiles({ cwd: workspace, scope: link })).rejects.toThrow(
      `Explicit file scope cannot be a symbolic link: ${link}`,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
