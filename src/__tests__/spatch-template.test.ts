import { expect, test } from "bun:test";
import {
  compileTemplate,
  findTemplateMatches,
  renderTemplate,
} from "../spatch/template.ts";

test("regex-constrained holes only match valid captures", () => {
  const template = compileTemplate(
    "const :[name~[a-z]+] = :[value~\\d+];",
  );
  const text = [
    "const alpha = 123;",
    "const Beta = 456;",
    "const gamma = nope;",
    "",
  ].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
  expect(matches[0]?.captures).toEqual({ name: "alpha", value: "123" });
});

test("repeated holes still enforce equality with regex constraints", () => {
  const template = compileTemplate(
    ":[x~[a-z_][a-z0-9_]*] + :[x];",
  );
  const text = [
    "foo + foo;",
    "foo + bar;",
    "123 + 123;",
    "",
  ].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
  expect(matches[0]?.captures).toEqual({ x: "foo" });
});

test("structural balancing ignores delimiters in strings and comments", () => {
  const template = compileTemplate("run(:[argument]);");
  const text = [
    "run(foo(bar));",
    "run((foo);",
    'run(")");',
    "run(/* ) */ value);",
    "",
  ].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(3);
  expect(matches[0]?.captures.argument).toBe("foo(bar)");
  expect(matches[1]?.captures.argument).toBe('")"');
  expect(matches[2]?.captures.argument).toBe("/* ) */ value");
});

test("compileTemplate rejects invalid hole regex", () => {
  expect(() => compileTemplate("const :[name~(] = 1;")).toThrow();
});

test("compileTemplate rejects adjacent holes", () => {
  expect(() => compileTemplate(":[a]:[b]")).toThrow(
    "Adjacent holes are ambiguous. Add a literal delimiter between them.",
  );
});

test("renderTemplate rejects unknown holes", () => {
  expect(() => renderTemplate("let :[missing] = 1;", { name: "value" })).toThrow(
    'Replacement uses unknown hole "missing".',
  );
});

test("renderTemplate supports constrained placeholders in replacement", () => {
  const rendered = renderTemplate(
    "let :[name~[a-z]+] = Number(:[value~\\d+]);",
    {
      name: "alpha",
      value: "42",
    },
  );

  expect(rendered).toBe("let alpha = Number(42);");
});

test("ellipsis wildcard matches variadic middle content", () => {
  const template = compileTemplate("foo(:[x], ..., :[y]);");
  const text = [
    "foo(first, second, third);",
    "foo(alpha, beta, gamma, delta);",
    "",
  ].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(2);
  expect(matches[0]?.captures).toEqual({
    x: "first",
    y: "third",
    "__ellipsis_0": "second",
  });
  expect(matches[1]?.captures).toEqual({
    x: "alpha",
    y: "delta",
    "__ellipsis_0": "beta, gamma",
  });
});

test("renderTemplate can reuse ellipsis capture in replacement", () => {
  const template = compileTemplate("foo(:[x], ...);");
  const text = "foo(first, second, third);";
  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
  const rendered = renderTemplate("bar(:[x], ...);", matches[0]!.captures);
  expect(rendered).toBe("bar(first, second, third);");
});
