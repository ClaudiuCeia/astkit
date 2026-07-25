import { expect, test } from "bun:test";

import { isBalancedChunk } from "../src/pattern/balance.ts";
import { findTemplateMatches } from "../src/pattern/match.ts";
import { compileTemplate } from "../src/pattern/syntax.ts";

test("isBalancedChunk ignores delimiters inside regex literals", () => {
  for (const chunk of ["/[)]/", "/[(]/", "/\\//g", "/[\\])}]/u", "return /}/;"]) {
    expect(isBalancedChunk(chunk)).toBe(true);
  }
});

test("isBalancedChunk distinguishes division from regex literals", () => {
  expect(isBalancedChunk("value / (count + 1)")).toBe(true);
  expect(isBalancedChunk("value / /[)]/.test(input)")).toBe(true);
});

test("isBalancedChunk handles strings, comments, and nested template expressions", () => {
  expect(isBalancedChunk("'([{}])'")).toBe(true);
  expect(isBalancedChunk('"([{}])"')).toBe(true);
  expect(isBalancedChunk("/* ([{}]) */ ({ value: 1 })")).toBe(true);
  expect(isBalancedChunk("`value ${fn({ nested: true })}`")).toBe(true);
});

test("isBalancedChunk rejects unterminated lexical states and mismatched delimiters", () => {
  for (const chunk of ["'open", '"open', "`open", "/* open", "/open", "([)]"]) {
    expect(isBalancedChunk(chunk)).toBe(false);
  }
});

test("template matching captures regex literals containing delimiters", () => {
  const matches = findTemplateMatches("run(/[)]/g);", compileTemplate("run(:[argument]);"));

  expect(matches).toHaveLength(1);
  expect(matches[0]?.captures.argument).toBe("/[)]/g");
});
