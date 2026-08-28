import { expect, test } from "bun:test";
import { compileTemplate } from "../src/pattern/syntax.ts";

test("rejects repeated overlapping alternatives", () => {
  expect(() => compileTemplate("x(:[value~(?:a|aa)+]);")).toThrow("ambiguous alternatives");
  expect(() => compileTemplate("x(:[value~(?:foo|foobar)+]);")).toThrow("ambiguous alternatives");
});

test("accepts short ambiguity but rejects chains beyond the cumulative budget", () => {
  expect(() => compileTemplate("x(:[value~a|aa]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a|aa)(?:a|aa)]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a|aa){2}]);")).not.toThrow();

  const repeatedChoices = "(?:a|aa)".repeat(28);
  expect(() => compileTemplate(`x(:[value~${repeatedChoices}b]);`)).toThrow(
    "cumulative regex ambiguity",
  );
});

test("counts consuming and zero-width nullable alternatives against the same budget", () => {
  const repeatedNullableChoices = "(?:a|)".repeat(32);
  expect(() => compileTemplate(`x(:[value~${repeatedNullableChoices}b]);`)).toThrow(
    "cumulative regex ambiguity",
  );

  const repeatedZeroWidthChoices = "(?:|)".repeat(32);
  expect(() => compileTemplate(`x(:[value~${repeatedZeroWidthChoices}b]);`)).toThrow(
    "cumulative regex ambiguity",
  );
  expect(() => compileTemplate("x(:[value~(?:|){9}]);")).toThrow("cumulative regex ambiguity");
});

test("applies one cumulative budget through bounded repetition nesting", () => {
  expect(() => compileTemplate(`x(:[value~${"(?:a|aa)".repeat(8)}]);`)).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a|aa){8}]);")).not.toThrow();
  expect(() => compileTemplate(`x(:[value~${"(?:a|aa)".repeat(9)}]);`)).toThrow(
    "cumulative regex ambiguity",
  );
  expect(() => compileTemplate("x(:[value~(?:a|aa){9}]);")).toThrow("cumulative regex ambiguity");
  expect(() => compileTemplate("x(:[value~(?:(?:a|aa){2}){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:(?:a|aa){2}){16}]);")).toThrow(
    "cumulative regex ambiguity",
  );
  expect(() => compileTemplate("x(:[value~(?:(?:(?:a|aa){2}){2}){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:(?:(?:(?:a|aa){2}){2}){2}){2}]);")).toThrow(
    "cumulative regex ambiguity",
  );
});

test("rejects overlapping sibling repetitions", () => {
  expect(() => compileTemplate("x(:[value~a+a+]);")).toThrow("overlapping sibling repetitions");
  expect(() => compileTemplate("x(:[value~[a-z]+[a-z]+]);")).toThrow(
    "overlapping sibling repetitions",
  );
  expect(() => compileTemplate("x(:[value~\\w+\\s*\\w+]);")).toThrow(
    "overlapping sibling repetitions",
  );
  expect(() => compileTemplate("x(:[value~\\x61+\\x61+]);")).toThrow(
    "overlapping sibling repetitions",
  );
  expect(() => compileTemplate("x(:[value~a?a?]);")).toThrow("overlapping sibling repetitions");
  expect(() => compileTemplate("x(:[value~a+(?:a+|b)c]);")).toThrow(
    "overlapping sibling repetitions",
  );

  const repeatedBranches = "(?:a+|b)".repeat(12);
  expect(() => compileTemplate(`x(:[value~${repeatedBranches}c]);`)).toThrow(
    "overlapping sibling repetitions",
  );
});

test("rejects repetition of nullable expressions", () => {
  expect(() => compileTemplate("x(:[value~(?:a|)*]);")).toThrow("nullable expression");
  expect(() => compileTemplate("x(:[value~(?:)*]);")).toThrow("nullable expression");
});

test("rejects compounding nested variable repetitions", () => {
  expect(() => compileTemplate("x(:[value~(?:a+)+]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:a{1,2})+]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:a+){3}]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:a+){4}b]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:a+){2}(?:a+){2}b]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:(?:a+){2}){2}b]);")).toThrow("nested quantifiers");
  expect(() => compileTemplate("x(:[value~(?:(?:(?:a+){2}){2}){2}b]);")).toThrow(
    "nested quantifiers",
  );

  expect(() => compileTemplate("x(:[value~(?:a+){2}b]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a+){2}b+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:(?:a{2}){2}){2}b]);")).not.toThrow();
});

test("does not treat optional wrappers as compounding nested quantifiers", () => {
  expect(() => compileTemplate("x(:[value~(?:a+)?b]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a+){0,1}b]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:(?:a+){2})?b]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a+){0,2}b]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a+){0,3}b]);")).toThrow("nested quantifiers");
});

test("caps cumulative bounded quantifier work independently of ambiguity", () => {
  expect(() => compileTemplate("x(:[value~(?:){2048}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:^){2048}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:){2049}]);")).toThrow("bounded regex repetition");
  expect(() => compileTemplate("x(:[value~(?:^){2049}]);")).toThrow("bounded regex repetition");
  expect(() => compileTemplate("x(:[value~(?:){1000000000}]);")).toThrow(
    "bounded regex repetition",
  );
  expect(() => compileTemplate("x(:[value~(?:^){1000000000}]);")).toThrow(
    "bounded regex repetition",
  );
  expect(() => compileTemplate("x(:[value~(?:){999999999999999999999}]);")).toThrow();
});

test("keeps deterministic bounded ranges out of the ambiguity budget", () => {
  expect(() => compileTemplate("x(:[value~a{0,256}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a*]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:^){0,255}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:^){0,256}]);")).toThrow("cumulative regex ambiguity");
  expect(() => compileTemplate("x(:[value~(?:a|aa){0,8}]);")).toThrow("cumulative regex ambiguity");
});

test("fails closed when regex safety analysis cannot parse", () => {
  expect(() => compileTemplate("x(:[value~a**]);")).toThrow(
    "regex safety analysis could not parse",
  );
});

test("rejects ambiguous legacy and non-ASCII escapes", () => {
  expect(() => compileTemplate("x(:[value~(?:\\01|\\x01)+b]);")).toThrow("legacy octal escapes");
  expect(() => compileTemplate("x(:[value~(?:\\011|\\t)+b]);")).toThrow("legacy octal escapes");
  expect(() => compileTemplate("x(:[value~(?:\\c|\\\\c)+b]);")).toThrow(
    "incomplete control escapes",
  );
  expect(() => compileTemplate("x(:[value~(?:[\\u0100-\\uffff]|\\u0100)+b]);")).toThrow(
    "ambiguous alternatives",
  );
  expect(() => compileTemplate("x(:[value~(?:[\\x80-\\xff]|\\x80)+b]);")).toThrow(
    "ambiguous alternatives",
  );
});

test("rejects unsupported regex modifier groups", () => {
  expect(() => compileTemplate("x(:[value~(?i:a)]);")).toThrow(
    "regex modifier groups are not allowed",
  );
  expect(() => compileTemplate("x(:[value~(?-s:.)]);")).toThrow(
    "regex modifier groups are not allowed",
  );
});

test("accepts deterministic common prefixes and small bounded structures", () => {
  expect(() => compileTemplate("x(:[value~(?:ab|cd)+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:ab|ac){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~^foo$|^foobar$]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a+b+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~\\d+\\.\\d+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:ab){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:a{1,2}){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?<part>ab){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~((ab){2}|cd)]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a*]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a?b?]);")).not.toThrow();
});

test("handles long deterministic common-prefix chains without engine execution", () => {
  const deterministicChoices = "(?:ab|ac)".repeat(24);
  expect(() => compileTemplate(`x(:[value~${deterministicChoices}z]);`)).not.toThrow();
});
