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

test("prefers every prefix-related multi-character operator", () => {
  const operators = [
    ">>>=",
    "===",
    "!==",
    ">>=",
    "<<=",
    "&&=",
    "||=",
    "??=",
    "**=",
    ">>>",
    "...",
    "=>",
    "==",
    "!=",
    "<=",
    ">=",
    "++",
    "--",
    "&&",
    "||",
    "??",
    "?.",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "&=",
    "|=",
    "^=",
    ">>",
    "<<",
    "**",
  ];

  expect(scanLexemeSpans(operators.join(" "))?.map((span) => span.value)).toEqual(operators);
});

test("keeps escaped line continuations inside quoted lexemes", () => {
  const lineTerminators = ["\n", "\r\n", "\u2028", "\u2029"];
  for (const lineTerminator of lineTerminators) {
    for (const quote of ["'", '"', "`"]) {
      const literal = `${quote}before\\${lineTerminator}after${quote}`;
      expect(scanLexemeSpans(literal)?.map((span) => span.value)).toEqual([literal]);
    }
  }
});

test("falls back to punctuation for unterminated quoted text", () => {
  expect(scanLexemeSpans("'unterminated")?.map((span) => span.value)).toEqual([
    "'",
    "unterminated",
  ]);
});
