import { expect, test } from "bun:test";
import {
  compileReplacementTemplate,
  renderCompiledTemplate,
  renderTemplate,
} from "../src/pattern/render.ts";

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
