import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rankCode } from "../src/code-rank/rank.ts";
import { getDeclarations } from "../src/nav/declarations.ts";
import { getDefinition } from "../src/nav/definition.ts";
import { getReferences } from "../src/nav/references.ts";

const originalCwd = process.cwd();
const tempWorkspaces: string[] = [];

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(
    tempWorkspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
});

test("file-target nav commands reject paths outside nearest git repository root", async () => {
  const workspace = await createBoundaryWorkspace({ withGit: true });
  process.chdir(workspace.cwd);

  expect(() => getDeclarations("../outside.ts")).toThrow("outside repository root");
  expect(() => getDefinition("../outside.ts", 1, 1)).toThrow("outside repository root");
  expect(() => getReferences("../outside.ts", 1, 1)).toThrow("outside repository root");
});

test("file-target nav commands reject symlinked paths escaping nearest git repository root", async () => {
  const workspace = await createBoundaryWorkspace({ withGit: true });
  await symlink(workspace.outsideFile, path.join(workspace.cwd, "escape.ts"));
  process.chdir(workspace.cwd);

  expect(() => getDeclarations("escape.ts")).toThrow("outside repository root");
  expect(() => getDefinition("escape.ts", 1, 1)).toThrow("outside repository root");
  expect(() => getReferences("escape.ts", 1, 1)).toThrow("outside repository root");
});

test("file-target nav commands reject paths outside cwd when no git repository root exists", async () => {
  const workspace = await createBoundaryWorkspace({ withGit: false });
  process.chdir(workspace.cwd);

  expect(() => getDeclarations("../outside.ts")).toThrow("outside cwd");
  expect(() => getDefinition("../outside.ts", 1, 1)).toThrow("outside cwd");
  expect(() => getReferences("../outside.ts", 1, 1)).toThrow("outside cwd");
});

test("code-rank rejects scope outside nearest git repository root", async () => {
  const workspace = await createBoundaryWorkspace({ withGit: true });

  await expect(
    rankCode({
      cwd: workspace.cwd,
      scope: "..",
    }),
  ).rejects.toThrow("outside repository root");
});

test("code-rank rejects scope outside cwd when no git repository root exists", async () => {
  const workspace = await createBoundaryWorkspace({ withGit: false });

  await expect(
    rankCode({
      cwd: workspace.cwd,
      scope: "..",
    }),
  ).rejects.toThrow("outside cwd");
});

test("nav commands do not leak references/definitions to tsconfig-included files outside boundary", async () => {
  const workspace = await createTsconfigIncludeEscapeWorkspace();
  process.chdir(workspace.cwd);

  const definitionResult = getDefinition("main.ts", 1, 10);
  expect(definitionResult.definitions).toEqual([]);

  const referencesResult = getReferences("main.ts", 1, 10);
  if (referencesResult.definition) {
    expect(referencesResult.definition.file.startsWith("..")).toBeFalse();
  }
  expect(
    referencesResult.references.every((reference) => !reference.file.startsWith("..")),
  ).toBeTrue();
});

async function createBoundaryWorkspace(options: { withGit: boolean }): Promise<{
  cwd: string;
  outsideFile: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "nav-boundary-"));
  tempWorkspaces.push(root);

  const cwd = path.join(root, "workspace");
  await mkdir(cwd, { recursive: true });
  if (options.withGit) {
    await mkdir(path.join(cwd, ".git"));
  }

  await writeFile(
    path.join(cwd, "tsconfig.json"),
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

  await writeFile(path.join(cwd, "inside.ts"), "export const inside = 1;\n", "utf8");

  const outsideFile = path.join(root, "outside.ts");
  await writeFile(outsideFile, "export const outside = 1;\n", "utf8");

  return { cwd, outsideFile };
}

async function createTsconfigIncludeEscapeWorkspace(): Promise<{
  cwd: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "nav-boundary-"));
  tempWorkspaces.push(root);

  const cwd = path.join(root, "workspace");
  await mkdir(cwd, { recursive: true });
  await mkdir(path.join(cwd, ".git"));

  const outsideFile = path.join(root, "outside.ts");
  await writeFile(outsideFile, "export const TOP_SECRET = 1;\n", "utf8");
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ESNext",
          strict: true,
        },
        include: ["**/*.ts", "../outside.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(cwd, "main.ts"),
    'import { TOP_SECRET } from "../outside.ts";\nexport const value = TOP_SECRET;\n',
    "utf8",
  );

  return { cwd };
}
