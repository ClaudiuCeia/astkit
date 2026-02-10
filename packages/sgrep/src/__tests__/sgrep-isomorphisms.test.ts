import { expect, test } from "bun:test";
import { expandPatternIsomorphisms } from "../isomorphisms/index.ts";

test("expandPatternIsomorphisms returns original pattern first", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];");

  expect(variants[0]).toBe("const total = :[x] + :[y];");
});

test("expandPatternIsomorphisms adds commutative variant", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];");

  expect(variants).toContain("const total = :[y] + :[x];");
});

test("expandPatternIsomorphisms adds parenthesized variants", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];");

  expect(variants).toContain("const total = (:[x] + :[y]);");
});

test("expandPatternIsomorphisms adds object literal key-order variants", () => {
  const variants = expandPatternIsomorphisms(
    "const map = { foo: :[x], bar: :[y] };",
  );

  expect(variants).toContain("const map = { bar: :[y], foo: :[x] };");
});

test("expandPatternIsomorphisms skips object literals with spread entries", () => {
  const variants = expandPatternIsomorphisms(
    "const map = { foo: :[x], ...rest, bar: :[y] };",
  );

  expect(variants).not.toContain("const map = { bar: :[y], ...rest, foo: :[x] };");
});

test("expandPatternIsomorphisms skips duplicate object keys", () => {
  const variants = expandPatternIsomorphisms(
    "const map = { foo: :[x], foo: :[y] };",
  );

  expect(variants).toEqual(["const map = { foo: :[x], foo: :[y] };"]);
});

test("expandPatternIsomorphisms can be disabled", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];", {
    enabled: false,
  });

  expect(variants).toEqual(["const total = :[x] + :[y];"]);
});

test("expandPatternIsomorphisms limits variant explosion", () => {
  const variants = expandPatternIsomorphisms(
    "const total = :[a] + :[b] + :[c] + :[d];",
    {
      maxVariants: 5,
    },
  );

  expect(variants.length).toBeLessThanOrEqual(5);
});
