import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type Fixture = {
  root: string;
  dispose: () => Promise<void>;
};

export async function createTsFixture(options: {
  fileCount: number;
  linesPerFile: number;
}): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "astkit-bench-"));
  const srcDir = path.join(root, "src");
  await mkdir(srcDir, { recursive: true });

  const { fileCount, linesPerFile } = options;
  for (let i = 0; i < fileCount; i += 1) {
    const lines: string[] = [];
    for (let j = 0; j < linesPerFile; j += 1) {
      // Keep it "real-ish" but deterministic; include some non-matching noise.
      lines.push(`const v${j} = ${j};`);
      lines.push(`function f${j}() { return v${j}; }`);
      lines.push(`const sum${j} = v${j} + ${j};`);
    }
    lines.push("");

    await writeFile(path.join(srcDir, `file-${i}.ts`), lines.join("\n"), "utf8");
  }

  return {
    root,
    dispose: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
