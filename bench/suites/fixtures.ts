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

/**
 * Creates a fixture workspace suitable for code-rank benchmarks.
 * Generates a hub-and-spoke graph: one shared module exports `fileCount` symbols,
 * and each spoke file imports and calls a subset of those symbols, producing a
 * realistic pattern of cross-file references for the ranking algorithm to process.
 */
export async function createCodeRankFixture(options: {
  fileCount: number;
  exportsPerFile: number;
}): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "astkit-bench-rank-"));
  const { fileCount, exportsPerFile } = options;

  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ESNext",
          strict: true,
        },
        include: ["**/*.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );

  // hub.ts: exports one function per file slot so each has a distinct rank.
  const hubLines: string[] = [];
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    for (let exportIndex = 0; exportIndex < exportsPerFile; exportIndex += 1) {
      hubLines.push(`export function sym_${fileIndex}_${exportIndex}(): number { return ${fileIndex * exportsPerFile + exportIndex}; }`);
    }
  }
  await writeFile(path.join(root, "hub.ts"), hubLines.join("\n") + "\n", "utf8");

  // spoke_N.ts: imports and calls symbols from hub.ts.
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const imports = Array.from({ length: exportsPerFile }, (_, j) => `sym_${fileIndex}_${j}`).join(", ");
    const calls = Array.from({ length: exportsPerFile }, (_, j) => `sym_${fileIndex}_${j}();`).join("\n");
    const content = `import { ${imports} } from "./hub.ts";\n\n${calls}\n`;
    await writeFile(path.join(root, `spoke-${fileIndex}.ts`), content, "utf8");
  }

  return {
    root,
    dispose: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
