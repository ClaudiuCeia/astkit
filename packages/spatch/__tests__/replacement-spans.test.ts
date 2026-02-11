import { expect, test } from "bun:test";
import { applyReplacementSpans } from "../src/replacement-spans.ts";

test("applyReplacementSpans rewrites spans in source order", () => {
  const source = "const one = 1;\nconst two = 2;\n";
  const firstMatched = "const one = 1;";
  const secondMatched = "const two = 2;";
  const firstStart = source.indexOf(firstMatched);
  const secondStart = source.indexOf(secondMatched);
  expect(firstStart).toBeGreaterThanOrEqual(0);
  expect(secondStart).toBeGreaterThanOrEqual(0);

  const result = applyReplacementSpans(source, [
    {
      start: secondStart,
      end: secondStart + secondMatched.length,
      replacement: "let two = 2;",
    },
    { start: firstStart, end: firstStart + firstMatched.length, replacement: "let one = 1;" },
  ]);

  expect(result).toBe("let one = 1;\nlet two = 2;\n");
});

test("applyReplacementSpans rejects overlapping spans", () => {
  const source = "abcdef";

  expect(() =>
    applyReplacementSpans(source, [
      { start: 1, end: 4, replacement: "X" },
      { start: 3, end: 5, replacement: "Y" },
    ]),
  ).toThrow("Invalid replacement spans: overlapping spans.");
});

test("applyReplacementSpans rejects out-of-bounds spans", () => {
  const source = "abcdef";

  expect(() =>
    applyReplacementSpans(source, [
      { start: 0, end: 2, replacement: "X" },
      { start: 7, end: 8, replacement: "Y" },
    ]),
  ).toThrow("Invalid replacement spans: out-of-bounds span.");
});
