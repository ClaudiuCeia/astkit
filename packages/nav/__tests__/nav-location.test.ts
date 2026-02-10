import { expect, test } from "bun:test";
import { parseFilePosition } from "../src/nav/location.ts";

test("parses colon syntax location", () => {
  expect(parseFilePosition("src/file.ts:12:7")).toEqual({
    file: "src/file.ts",
    line: 12,
    character: 7,
  });
});

test("parses Windows path using colon syntax", () => {
  expect(parseFilePosition("C:\\repo\\file.ts:12:7")).toEqual({
    file: "C:\\repo\\file.ts",
    line: 12,
    character: 7,
  });
});

test("rejects missing location segments", () => {
  expect(() => parseFilePosition("src/file.ts:12")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
});

test("rejects zero line or character", () => {
  expect(() => parseFilePosition("src/file.ts:0:7")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
  expect(() => parseFilePosition("src/file.ts:7:0")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
});

test("rejects non-numeric line and character", () => {
  expect(() => parseFilePosition("src/file.ts:line:7")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
  expect(() => parseFilePosition("src/file.ts[7:col]")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
});

test("rejects empty file path", () => {
  expect(() => parseFilePosition(" :12:7")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
});

test("rejects bracket syntax", () => {
  expect(() => parseFilePosition("src/file.ts[12:7]")).toThrow(
    "Invalid location: expected <file>:<line>:<character>.",
  );
});
