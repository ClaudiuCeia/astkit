import { expect, test } from "bun:test";
import { analyzeLexemeLayout, scanLexemeSpans } from "../src/pattern/lexemes.ts";

test("scans trivia, literals, identifiers, numbers, and operators", () => {
  const source = ' \t// lead\nconst value = "a\\\"b" ?? `plain`; /* tail */';
  const layout = analyzeLexemeLayout(source);

  expect(layout).toEqual({
    leadingTrivia: " \t// lead\n",
    lexemes: ["const", "value", "=", '"a\\\"b"', "??", "`plain`", ";"],
    separators: [" ", " ", " ", " ", " ", ""],
    trailingTrivia: " /* tail */",
  });
});

test("prefers multi-character operators and complete numeric literals", () => {
  const source = "left >>>= 2_000.5e-2 &&= right !== other";

  expect(scanLexemeSpans(source)?.map((span) => span.value)).toEqual([
    "left",
    ">>>=",
    "2_000.5e-2",
    "&&=",
    "right",
    "!==",
    "other",
  ]);
});

test("falls back to punctuation for unterminated quoted text", () => {
  expect(scanLexemeSpans("'unterminated")?.map((span) => span.value)).toEqual([
    "'",
    "unterminated",
  ]);
});
