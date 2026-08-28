import { test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { Chalk } from "chalk";
import ts from "@typescript/typescript6";
import { formatDeclarationsOutput, getDeclarations } from "../src/nav/declarations.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(fixturesDir);
});

afterAll(() => {
  process.chdir(originalCwd);
});

test("lists exported declarations from simple.ts", () => {
  const result = getDeclarations("simple.ts");

  expect(result.file).toBe("simple.ts");
  expect(result.declarations.length).toBeGreaterThan(0);

  const names = result.declarations.map((d) => d.name);
  expect(names).toContain("User");
  expect(names).toContain("UserService");
  expect(names).toContain("createUser");
  expect(names).toContain("DEFAULT_USER");
  expect(names).toContain("UserId");
  expect(names).toContain("Role");
});

test("interface has correct kind and members", () => {
  const result = getDeclarations("simple.ts");
  const user = result.declarations.find((d) => d.name === "User");

  expect(user).toBeDefined();
  expect(user!.kind).toBe("interface");
  expect(user!.members).toBeDefined();
  expect(user!.members!.length).toBe(3);

  const memberNames = user!.members!.map((m) => m.name);
  expect(memberNames).toContain("id");
  expect(memberNames).toContain("name");
  expect(memberNames).toContain("email");
});

test("class has correct kind and members", () => {
  const result = getDeclarations("simple.ts");
  const svc = result.declarations.find((d) => d.name === "UserService");

  expect(svc).toBeDefined();
  expect(svc!.kind).toBe("class");
  expect(svc!.members).toBeDefined();

  const memberNames = svc!.members!.map((m) => m.name);
  expect(memberNames).toContain("add");
  expect(memberNames).toContain("findById");
});

test("function has correct kind and signature", () => {
  const result = getDeclarations("simple.ts");
  const fn = result.declarations.find((d) => d.name === "createUser");

  expect(fn).toBeDefined();
  expect(fn!.kind).toBe("function");
  expect(fn!.signature).toContain("Partial<User>");
  expect(fn!.signature).toContain("User");
});

test("const has correct kind", () => {
  const result = getDeclarations("simple.ts");
  const c = result.declarations.find((d) => d.name === "DEFAULT_USER");

  expect(c).toBeDefined();
  expect(c!.kind).toBe("const");
});

test("type alias has correct kind", () => {
  const result = getDeclarations("simple.ts");
  const t = result.declarations.find((d) => d.name === "UserId");

  expect(t).toBeDefined();
  expect(t!.kind).toBe("type");
});

test("enum has correct kind", () => {
  const result = getDeclarations("simple.ts");
  const e = result.declarations.find((d) => d.name === "Role");

  expect(e).toBeDefined();
  expect(e!.kind).toBe("enum");
});

test("preserves declaration forms and supplies inferred types", () => {
  const result = getDeclarations("declaration-forms.ts");
  const byName = new Map(result.declarations.map((declaration) => [declaration.name, declaration]));

  expect(byName.get("mutable")?.kind).toBe("let");
  expect(byName.get("mutable")?.declarationText).toContain("export let mutable: number");
  expect(byName.get("legacy")?.kind).toBe("var");
  expect(byName.get("legacy")?.declarationText).toContain("export var legacy: string");
  expect(byName.get("external")?.declarationText).toContain("export declare function external");
  expect(byName.get("default")?.declarationText).toContain("export default async function load<");

  const base = byName.get("Base");
  expect(base?.declarationText).toContain("export abstract class Base<T>");
  expect(base?.members?.find((member) => member.name === "count")?.signature).toContain(
    "readonly count: 1",
  );
  expect(base?.members?.find((member) => member.name === "parse")?.signature).toBe(
    "abstract parse(value: T): string",
  );
  expect(
    base?.members?.filter((member) => member.name === "convert").map((member) => member.signature),
  ).toEqual(["convert(value: string): string", "convert(value: number): number"]);
  expect(base?.members?.find((member) => member.name === "items")?.signature).toContain("*items");
  expect(base?.members?.find((member) => member.name === "label")?.signature).toBe(
    "get label(): string",
  );

  const mode = byName.get("Mode");
  expect(mode?.declarationText).toContain("export const enum Mode");
  expect(mode?.members?.map((member) => member.signature)).toEqual([
    'Fast = "fast"',
    'Slow = "slow"',
  ]);
  expect(mode?.members?.map((member) => member.doc)).toEqual([
    "Prefer this mode for latency-sensitive work.",
    "Prefer this mode for thorough work.",
  ]);
});

test("prints declaration-safe inferred variable types", () => {
  const result = getDeclarations("declaration-inference.ts");
  const output = formatDeclarationsOutput(result);

  expect(output).toMatchSnapshot();
  expect(output).toContain("export const token: unique symbol");
  expect(output).not.toContain("typeof token");
  expect(output).not.toContain("typeof Anonymous");
  expect(output).not.toContain("typeof InternalName");
  expect(output).not.toContain("nonNameable: Local");
  expect(output).toContain("export const nominal: unknown");
  expect(output).not.toContain("nominal: Nominal");
  expect(output).toContain("export const publicNominal: PublicNominal");
});

test("retains every exported overload and omits its implementation", () => {
  const result = getDeclarations("declaration-forms.ts");
  const normalize = result.declarations.find((declaration) => declaration.name === "normalize");

  expect(normalize?.declarationText).toContain("normalize(value: string): string");
  expect(normalize?.overloads).toEqual([
    expect.objectContaining({
      declarationText: expect.stringContaining("normalize(value: number): number"),
    }),
  ]);
  expect(formatDeclarationsOutput(result)).not.toContain("normalize(value: string | number)");
});

test("normalizes ambient function modifiers for default and named aliases", () => {
  const result = getDeclarations("ambient-aliases.ts");
  const defaultParse = result.declarations.find((declaration) => declaration.name === "default");
  const ambientParse = result.declarations.find(
    (declaration) => declaration.name === "ambientParse",
  );

  expect(defaultParse?.declarationText).toBe(
    "export default function parse(value: string): string",
  );
  expect(defaultParse?.overloads).toEqual([
    {
      declarationText: "export default function parse(value: number): number",
      line: 5,
    },
  ]);
  expect(ambientParse?.declarationText).toBe(
    "export declare function ambientParse(value: boolean): boolean",
  );

  const printedDeclarations = result.declarations.flatMap((declaration) => [
    ...(declaration.declarationText ? [declaration.declarationText] : []),
    ...(declaration.overloads?.map((overload) => overload.declarationText) ?? []),
  ]);
  const fileName = path.join(fixturesDir, "printed-ambient-aliases.d.ts");
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    strict: true,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (candidate) => candidate === fileName || ts.sys.fileExists(candidate);
  host.readFile = (candidate) =>
    candidate === fileName ? printedDeclarations.join("\n") : ts.sys.readFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
    candidate === fileName
      ? ts.createSourceFile(
          candidate,
          printedDeclarations.join("\n"),
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : getSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([fileName], compilerOptions, host);

  expect(program.getSyntacticDiagnostics()).toEqual([]);
});

test("each declaration has a line number", () => {
  const result = getDeclarations("simple.ts");

  for (const decl of result.declarations) {
    expect(decl.line).toBeGreaterThan(0);
  }
});

test("handles file with no exports", () => {
  // importer.ts exports getUserRole only
  const result = getDeclarations("importer.ts");

  expect(result.declarations.length).toBe(1);
  expect(result.declarations[0]!.name).toBe("getUserRole");
});

test("lists named, aliased, type-only, and star re-exports from barrels", () => {
  const result = getDeclarations("barrel.ts");

  expect(result.declarations.map((declaration) => declaration.name)).toEqual([
    "makeUser",
    "User",
    "parseValue",
    "default",
    "getUserRole",
  ]);
  expect(result.declarations.find((declaration) => declaration.name === "makeUser")?.kind).toBe(
    "function",
  );
  expect(result.declarations.find((declaration) => declaration.name === "User")?.kind).toBe(
    "interface",
  );
  expect(result.declarations.find((declaration) => declaration.name === "getUserRole")?.kind).toBe(
    "function",
  );
  const parseValue = result.declarations.find((declaration) => declaration.name === "parseValue");
  expect(parseValue?.declarationText).toContain("function parseValue(value: string): string");
  expect(parseValue?.declarationText).not.toContain("default");
  expect(parseValue?.doc).toBe("Parse a default value.");
  expect(parseValue?.overloads).toEqual([
    {
      declarationText: expect.stringContaining("function parseValue(value: number): number"),
      line: 3,
    },
  ]);
  expect(parseValue?.line).toBe(3);
  expect(
    parseValue?.overloads?.every((overload) => !overload.declarationText.includes("default")),
  ).toBe(true);

  const defaultParse = result.declarations.find((declaration) => declaration.name === "default");
  expect(defaultParse?.declarationText).toContain(
    "export default function parse(value: string): string",
  );
  expect(defaultParse?.doc).toBe("Parse a named value.");
  expect(defaultParse?.overloads).toEqual([
    {
      declarationText: expect.stringContaining(
        "export default function parse(value: number): number",
      ),
      line: 4,
    },
  ]);
  expect(defaultParse?.line).toBe(4);
  const output = formatDeclarationsOutput(result);
  expect(output).toContain("Parse a default value.");
  expect(output).toContain("Parse a named value.");
  expect(output).not.toContain("value: string | number");
  expect(result.declarations.every((declaration) => declaration.line > 0)).toBe(true);
});

test("formats declarations as compact text by default", () => {
  const result = getDeclarations("simple.ts");
  const output = formatDeclarationsOutput(result);

  expect(output.split("\n")[0]).toBe("//simple.ts");
  expect(output).toContain("export interface User");
  expect(output).toContain("export class UserService");
  expect(output).toContain("export function createUser");
  expect(output).toContain("email:");
  expect(output).toContain("findById(");
});

test("includes jsdoc blocks when available", () => {
  const result = getDeclarations(path.resolve(fixturesDir, "..", "..", "src", "service.ts"));
  const output = formatDeclarationsOutput(result);

  expect(output).toContain("Convert 1-indexed line:character to 0-indexed offset");
  expect(output).toContain("Get relative path from project root");
});

test("nav declarations output matches snapshot", () => {
  const result = getDeclarations("nav-docs.ts");
  const output = formatDeclarationsOutput(result, { color: false });
  expect(output).toMatchSnapshot();
});

test("colors function names in declarations output", () => {
  const result = getDeclarations("simple.ts");
  const chalkInstance = new Chalk({ level: 1 });
  const output = formatDeclarationsOutput(result, { chalkInstance });

  expect(output).toContain(chalkInstance.yellow("createUser"));
});

test("formatDeclarationsOutput escapes terminal control sequences", () => {
  const output = formatDeclarationsOutput(
    {
      file: "src/\u001b[31mevil.ts",
      doc: "Header \u001b[2J doc",
      declarations: [
        {
          name: "Box\u001b[7m",
          kind: "class",
          signature: "Box\u001b[8m",
          line: 1,
          doc: "Decl \u0007 doc",
          members: [
            {
              name: "member\u001b[33m",
              signature: "member(arg: string): string\u001b[0m",
              line: 2,
            },
          ],
        },
      ],
    },
    { color: false },
  );

  expect(output).not.toContain("\u001b");
  expect(output).toContain("//src/\\x1b[31mevil.ts");
  expect(output).toContain("Header \\x1b[2J doc");
  expect(output).toContain("Box\\x1b[7m");
  expect(output).toContain("Decl \\x07 doc");
  expect(output).toContain("string\\x1b[0m");
});
