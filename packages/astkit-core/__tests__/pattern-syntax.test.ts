import { expect, test } from "bun:test";
import { compileTemplate } from "../src/pattern/syntax.ts";

test("rejects repeated overlapping alternatives", () => {
  expect(() => compileTemplate("x(:[value~(?:a|aa)+]);")).toThrow("overlapping alternatives");
  expect(() => compileTemplate("x(:[value~(?:foo|foobar)+]);")).toThrow("overlapping alternatives");
});

test("rejects standalone overlapping alternatives that can compound", () => {
  expect(() => compileTemplate("x(:[value~a|aa]);")).toThrow("overlapping alternatives");

  const repeatedChoices = "(?:a|aa)".repeat(28);
  expect(() => compileTemplate(`x(:[value~${repeatedChoices}b]);`)).toThrow(
    "overlapping alternatives",
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
    "overlapping alternatives",
  );
  expect(() => compileTemplate("x(:[value~(?:[\\x80-\\xff]|\\x80)+b]);")).toThrow(
    "overlapping alternatives",
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

test("accepts disjoint and bounded regex structures", () => {
  expect(() => compileTemplate("x(:[value~(?:ab|cd)+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a+b+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~\\d+\\.\\d+]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?:ab){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~(?<part>ab){2}]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~((ab){2}|cd)]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a*]);")).not.toThrow();
  expect(() => compileTemplate("x(:[value~a?b?]);")).not.toThrow();
});
