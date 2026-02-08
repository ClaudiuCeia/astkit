import { test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { formatDeclarationsOutput, getDeclarations } from "../nav/declarations.ts";

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
  const result = getDeclarations(path.resolve(fixturesDir, "..", "..", "service.ts"));
  const output = formatDeclarationsOutput(result);

  expect(output).toContain("Convert 1-indexed line:character to 0-indexed offset");
  expect(output).toContain("Get relative path from project root");
});
