import { expect, test } from "bun:test";
import {
  compileReplacementTemplate,
  renderCompiledTemplate,
  renderTemplate,
  validateReplacementTemplate,
} from "../src/pattern/render.ts";
import { compileTemplate } from "../src/pattern/syntax.ts";

test("renderCompiledTemplate matches renderTemplate output", () => {
  const source = "let :[name] = Number(:[value]);";
  const captures = { name: "x", value: "1" };

  const compiled = compileReplacementTemplate(source);

  expect(renderCompiledTemplate(compiled, captures)).toBe(renderTemplate(source, captures));
});

test("compileReplacementTemplate supports empty replacement", () => {
  const compiled = compileReplacementTemplate("");

  expect(renderCompiledTemplate(compiled, {})).toBe("");
});

test("renderCompiledTemplate validates unknown holes", () => {
  const compiled = compileReplacementTemplate("let :[name] = :[missing];");

  expect(() => renderCompiledTemplate(compiled, { name: "x" })).toThrow(
    'Replacement uses unknown hole "missing".',
  );
});

test("renderCompiledTemplate ignores inherited capture properties", () => {
  const compiled = compileReplacementTemplate(":[constructor]");

  expect(() => renderCompiledTemplate(compiled, {})).toThrow(
    'Replacement uses unknown hole "constructor".',
  );
  expect(renderCompiledTemplate(compiled, { constructor: "value" })).toBe("value");
});

test("validateReplacementTemplate rejects unavailable captures before rendering", () => {
  const pattern = compileTemplate("const :[name] = 1;");

  expect(() =>
    validateReplacementTemplate(pattern, compileReplacementTemplate("let :[missing] = 1;")),
  ).toThrow('Replacement uses unknown hole "missing".');
  expect(() =>
    validateReplacementTemplate(pattern, compileReplacementTemplate("let ... = 1;")),
  ).toThrow("Replacement uses ellipsis #1 but pattern did not capture it.");
});

test("compileTemplate rejects hole names reserved for ellipsis captures", () => {
  expect(() => compileTemplate("call(:[__ellipsis_0]);")).toThrow(
    'Hole name "__ellipsis_0" uses a reserved prefix.',
  );
});

test("renderTemplate does not merge replacement lexemes", () => {
  expect(renderTemplate("x in y", {}, { preserveLayoutFrom: "a+b" })).toBe("x in y");
  expect(renderTemplate("x in y", {}, { preserveLayoutFrom: "a/* keep */+b" })).toBe(
    "x/* keep */in y",
  );
});
