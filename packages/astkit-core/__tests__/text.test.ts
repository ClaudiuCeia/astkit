import { expect, test } from "bun:test";

import { createLineStarts, toLineCharacter } from "../src/text.ts";

test("createLineStarts recognizes ECMAScript line terminators", () => {
  const text = "a\r\nb\rc\nd\u2028e\u2029f";
  const starts = createLineStarts(text);

  expect(starts.map((start) => text[start])).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(starts).toHaveLength(6);
});

test("toLineCharacter reports positions after mixed line terminators", () => {
  const text = "ab\r\ncd\u2028ef";
  const starts = createLineStarts(text);

  expect(toLineCharacter(starts, text.indexOf("c"))).toEqual({ line: 2, character: 1 });
  expect(toLineCharacter(starts, text.indexOf("e"))).toEqual({ line: 3, character: 1 });
  expect(toLineCharacter(starts, text.length)).toEqual({ line: 3, character: 3 });
});

test("toLineCharacter handles empty indexes and positions before the first line", () => {
  expect(toLineCharacter([], 3)).toEqual({ line: 1, character: 4 });
  expect(toLineCharacter([0], -1)).toEqual({ line: 1, character: 1 });
});
