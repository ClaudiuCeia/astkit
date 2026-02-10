import { expect, test } from "bun:test";
import { parsePatchDocument } from "../src/patch-document.ts";

test("parsePatchDocument extracts pattern/replacement from +/- lines", () => {
  const patch = [
    "function wrap() {",
    "-  const value = 1;",
    "+  let value = 1;",
    "  return value;",
    "}",
  ].join("\n");

  const parsed = parsePatchDocument(patch);

  expect(parsed.pattern).toBe(
    [
      "function wrap() {",
      "  const value = 1;",
      "  return value;",
      "}",
    ].join("\n"),
  );
  expect(parsed.replacement).toBe(
    [
      "function wrap() {",
      "  let value = 1;",
      "  return value;",
      "}",
    ].join("\n"),
  );
  expect(parsed.additions).toBe(1);
  expect(parsed.deletions).toBe(1);
  expect(parsed.contextLines).toBe(3);
  expect(parsed.trailingNewline).toBe(false);
});

test("parsePatchDocument preserves escaped +/- context lines", () => {
  const patch = ["\\-old", "\\+new", "-remove", "+insert"].join("\n");

  const parsed = parsePatchDocument(patch);

  expect(parsed.pattern).toBe(["-old", "+new", "remove"].join("\n"));
  expect(parsed.replacement).toBe(["-old", "+new", "insert"].join("\n"));
});

test("parsePatchDocument preserves trailing newline", () => {
  const patch = ["-const x = 1;", "+let x = 1;", ""].join("\n");

  const parsed = parsePatchDocument(patch);

  expect(parsed.pattern).toBe("const x = 1;\n");
  expect(parsed.replacement).toBe("let x = 1;\n");
  expect(parsed.trailingNewline).toBe(true);
});

test("parsePatchDocument rejects inputs without change markers", () => {
  expect(() => parsePatchDocument("const x = 1;\n")).toThrow(
    "Patch document must contain at least one '+' or '-' line.",
  );
});
