import { expect, test } from "bun:test";

import { findTemplateMatches } from "../src/pattern/match.ts";
import { compileTemplate } from "../src/pattern/syntax.ts";

test("structural matches require complete identifier lexemes", () => {
  const template = compileTemplate("foo(:[argument]);");
  const source = "foobar(first);\nmyfoo(second);\nfoo(third);\n";

  const matches = findTemplateMatches(source, template);

  expect(matches).toHaveLength(1);
  expect(matches[0]?.captures.argument).toBe("third");
});

test("structural matches ignore code-like text in strings and comments", () => {
  const template = compileTemplate("foo(:[argument]);");
  const source = 'const text = "foo(first);";\n// foo(second);\n/* foo(third); */\nfoo(fourth);\n';

  const matches = findTemplateMatches(source, template);

  expect(matches).toHaveLength(1);
  expect(matches[0]?.captures.argument).toBe("fourth");
});

test("structural matches require complete operator lexemes", () => {
  const template = compileTemplate("left = :[right];");
  const source = "left == right;\nleft => right;\nleft = right;\n";

  const matches = findTemplateMatches(source, template);

  expect(matches).toHaveLength(1);
  expect(matches[0]?.text).toBe("left = right;");
  expect(matches[0]?.captures.right).toBe("right");
});
