import { expect, test } from "bun:test";
import type { OverloadInfo } from "../src/index.ts";

test("exports overload information from the public entrypoint", () => {
  const overload: OverloadInfo = {
    declarationText: "export function parse(value: string): string",
    line: 1,
  };

  expect(overload.line).toBe(1);
});
