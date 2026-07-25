import { expect, test } from "bun:test";
import { expandPatternIsomorphisms, UNSAFE_ISOMORPHISM_RULES } from "../src/isomorphisms/index.ts";

test("expandPatternIsomorphisms returns original pattern first", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];");

  expect(variants[0]).toBe("const total = :[x] + :[y];");
});

test("expandPatternIsomorphisms adds commutative variant", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];", {
    rules: UNSAFE_ISOMORPHISM_RULES,
  });

  expect(variants).toContain("const total = :[y] + :[x];");
});

test("expandPatternIsomorphisms adds parenthesized variants", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];");

  expect(variants).toContain("const total = (:[x] + :[y]);");
});

test("expandPatternIsomorphisms adds object literal key-order variants", () => {
  const variants = expandPatternIsomorphisms("const map = { foo: :[x], bar: :[y] };", {
    rules: UNSAFE_ISOMORPHISM_RULES,
  });

  expect(variants).toContain("const map = { bar: :[y], foo: :[x] };");
});

test("expandPatternIsomorphisms skips object literals with spread entries", () => {
  const variants = expandPatternIsomorphisms("const map = { foo: :[x], ...rest, bar: :[y] };", {
    rules: UNSAFE_ISOMORPHISM_RULES,
  });

  expect(variants).not.toContain("const map = { bar: :[y], ...rest, foo: :[x] };");
});

test("expandPatternIsomorphisms skips duplicate object keys", () => {
  const variants = expandPatternIsomorphisms("const map = { foo: :[x], foo: :[y] };", {
    rules: UNSAFE_ISOMORPHISM_RULES,
  });

  expect(variants).toEqual(["const map = { foo: :[x], foo: :[y] };"]);
});

test("expandPatternIsomorphisms can be disabled", () => {
  const variants = expandPatternIsomorphisms("const total = :[x] + :[y];", {
    enabled: false,
  });

  expect(variants).toEqual(["const total = :[x] + :[y];"]);
});

test("expandPatternIsomorphisms limits variant explosion", () => {
  const variants = expandPatternIsomorphisms("const total = :[a] + :[b] + :[c] + :[d];", {
    maxVariants: 5,
  });

  expect(variants.length).toBeLessThanOrEqual(5);
});

test("default isomorphisms do not reorder expressions or remove required parentheses", () => {
  expect(expandPatternIsomorphisms("left() + right()")).not.toContain("right() + left()");
  expect(expandPatternIsomorphisms("(a + b) * c")).not.toContain("a + b * c");
  expect(expandPatternIsomorphisms("{ a: left(), b: right() }")).not.toContain(
    "{ b: right(), a: left() }",
  );
});

test("parenthesis expansion does not repeatedly wrap an expression", () => {
  expect(expandPatternIsomorphisms("a + b")).toEqual(["a + b", "(a + b)"]);
});

test("expandPatternIsomorphisms rejects invalid variant limits", () => {
  for (const maxVariants of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => expandPatternIsomorphisms("a + b", { maxVariants })).toThrow(
      "maxVariants must be a positive safe integer",
    );
  }
});
