import { expect, test } from "bun:test";
import { compileTemplate, findTemplateMatches, renderTemplate } from "@claudiu-ceia/astkit-core";

test("regex-constrained holes only match valid captures", () => {
  const template = compileTemplate("const :[name~[a-z]+] = :[value~\\d+];");
  const text = ["const alpha = 123;", "const Beta = 456;", "const gamma = nope;", ""].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
  expect(matches[0]?.captures).toEqual({ name: "alpha", value: "123" });
});

test("repeated holes still enforce equality with regex constraints", () => {
  const template = compileTemplate(":[x~[a-z_][a-z0-9_]*] + :[x];");
  const text = ["foo + foo;", "foo + bar;", "123 + 123;", ""].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
  expect(matches[0]?.captures).toEqual({ x: "foo" });
});

test("structural balancing ignores delimiters in strings and comments", () => {
  const template = compileTemplate("run(:[argument]);");
  const text = ["run(foo(bar));", "run((foo);", 'run(")");', "run(/* ) */ value);", ""].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(3);
  expect(matches[0]?.captures.argument).toBe("foo(bar)");
  expect(matches[1]?.captures.argument).toBe('")"');
  expect(matches[2]?.captures.argument).toBe("/* ) */ value");
});

test("compileTemplate rejects invalid hole regex", () => {
  expect(() => compileTemplate("const :[name~(] = 1;")).toThrow();
});

test("compileTemplate rejects unsafe hole regex constructs", () => {
  expect(() => compileTemplate("const :[name~([a-z]+)+] = 1;")).toThrow("nested quantifiers");
  expect(() => compileTemplate("const :[name~([a-z]+)\\1] = 1;")).toThrow("backreferences");
  expect(() => compileTemplate("const :[name~(?=foo)[a-z]+] = 1;")).toThrow("lookaround");
});

test("constraint regex matching rejects oversized captures", () => {
  const template = compileTemplate("value(:[arg~[a-z]+]);");
  const oversized = "a".repeat(2050);
  const text = `value(${oversized});\n`;

  const matches = findTemplateMatches(text, template);

  expect(matches).toHaveLength(0);
});

test("compileTemplate rejects adjacent holes", () => {
  expect(() => compileTemplate(":[a]:[b]")).toThrow(
    "Adjacent holes are ambiguous. Add a literal delimiter between them.",
  );
});

test("compileTemplate hints about escaping literals for unclosed holes", () => {
  expect(() => compileTemplate("const :[name] = ':[value';")).toThrow("Hint:");
});

test("renderTemplate rejects unknown holes", () => {
  expect(() => renderTemplate("let :[missing] = 1;", { name: "value" })).toThrow(
    'Replacement uses unknown hole "missing".',
  );
});

test("renderTemplate supports constrained placeholders in replacement", () => {
  const rendered = renderTemplate("let :[name~[a-z]+] = Number(:[value~\\d+]);", {
    name: "alpha",
    value: "42",
  });

  expect(rendered).toBe("let alpha = Number(42);");
});

test("ellipsis wildcard matches variadic middle content", () => {
  const template = compileTemplate("foo(:[x], ..., :[y]);");
  const text = ["foo(first, second, third);", "foo(alpha, beta, gamma, delta);", ""].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(2);
  expect(matches[0]?.captures).toEqual({
    x: "first",
    y: "third",
    __ellipsis_0: "second",
  });
  expect(matches[1]?.captures).toEqual({
    x: "alpha",
    y: "delta",
    __ellipsis_0: "beta, gamma",
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

test("compileTemplate allows escaping hole opener and ellipsis as literal text", () => {
  const holeLiteral = compileTemplate("const :[name] = '\\:[value';");
  const holeMatches = findTemplateMatches("const foo = ':[value';\n", holeLiteral);
  expect(holeMatches.length).toBe(1);
  expect(holeMatches[0]?.captures).toEqual({ name: "foo" });

  const dotsLiteral = compileTemplate('const dots = "\\...";');
  const dotsMatches = findTemplateMatches('const dots = "...";\n', dotsLiteral);
  expect(dotsMatches.length).toBe(1);
});

test("literal matching is whitespace/comment-insensitive between lexemes", () => {
  const template = compileTemplate("transform(:[input], :[config], ...);");
  const text = [
    "transform(one, two, three);",
    "transform(one,two,three);",
    "transform(\n  one /* comment */,\n  two,\n  three,\n);",
    "",
  ].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(3);
  expect(matches[0]?.captures).toEqual({
    input: "one",
    config: "two",
    __ellipsis_0: "three",
  });
  expect(matches[1]?.captures).toEqual({
    input: "one",
    config: "two",
    __ellipsis_0: "three",
  });
  expect(matches[2]?.captures).toEqual({
    input: "one /* comment */",
    config: "two",
    __ellipsis_0: "three,",
  });
});

test("literal matching keeps string contents exact", () => {
  const template = compileTemplate('const msg = "a b";');
  const text = ['const msg = "a  b";', 'const msg = "a b";', ""].join("\n");

  const matches = findTemplateMatches(text, template);

  expect(matches.length).toBe(1);
});

test("compileTemplate rejects templates that only contain trivia", () => {
  expect(() => compileTemplate(" \n// comment only\n/* block */\n")).toThrow(
    "Template must include at least one literal character to avoid empty matches.",
  );
});

test("renderTemplate preserves source trivia layout for lexical rewrites", () => {
  const rendered = renderTemplate(
    "let :[name] = :[value] ;",
    {
      name: "value",
      value: "1",
    },
    {
      preserveLayoutFrom: " const   value = 1 ; // keep\n",
    },
  );

  expect(rendered).toBe(" let   value = 1 ; // keep\n");
});

test("renderTemplate returns original source for lexeme-equivalent rewrite", () => {
  const source = 'import { dot } from "./common.ts";\n';

  const rendered = renderTemplate(
    "import{:[name]}from:[module];",
    {
      name: "dot",
      module: '"./common.ts"',
    },
    {
      preserveLayoutFrom: source,
    },
  );

  expect(rendered).toBe(source);
});
