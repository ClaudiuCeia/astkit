import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
  createTerminalInteractiveDecider,
  formatInteractiveChangeBlock,
  parseInteractiveChoice,
} from "../src/command/interactive/terminal.ts";
import type { InteractiveContext } from "../src/command/interactive/types.ts";

function createContext(): InteractiveContext {
  return {
    file: "src/sample.ts",
    changeNumber: 1,
    totalChanges: 2,
    occurrence: {
      start: 0,
      end: 15,
      line: 10,
      character: 3,
      matched: "const value = 1;\n",
      replacement: "let value = 1;\n",
      captures: {
        name: "value",
      },
    },
  };
}

test("parseInteractiveChoice parses accepted values", () => {
  expect(parseInteractiveChoice("")).toBe("no");
  expect(parseInteractiveChoice(" n ")).toBe("no");
  expect(parseInteractiveChoice("no")).toBe("no");
  expect(parseInteractiveChoice("y")).toBe("yes");
  expect(parseInteractiveChoice("yes")).toBe("yes");
  expect(parseInteractiveChoice("a")).toBe("all");
  expect(parseInteractiveChoice("all")).toBe("all");
  expect(parseInteractiveChoice("q")).toBe("quit");
  expect(parseInteractiveChoice("quit")).toBe("quit");
  expect(parseInteractiveChoice("maybe")).toBe(null);
});

test("formatInteractiveChangeBlock prints diff block with actions", () => {
  const output = formatInteractiveChangeBlock(createContext(), { color: false });

  expect(output).toContain("Change 1/2");
  expect(output).toContain("@@ -10,1 +10,1 @@");
  expect(output).toContain("-const value = 1;");
  expect(output).toContain("+let value = 1;");
  expect(output).toContain("Actions: [y] apply");
});

test("createTerminalInteractiveDecider retries invalid input then accepts selection", async () => {
  const writes: string[] = [];
  const prompts: string[] = [];
  const answers = ["invalid", "yes"];
  let closed = false;
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = true;
  stdout.isTTY = true;
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return originalWrite(chunk);
  }) as typeof stdout.write;

  const prompt = await createTerminalInteractiveDecider(true, {
    stdin,
    stdout,
    createPrompt: () => ({
      async question(input: string) {
        prompts.push(input);
        return answers.shift() ?? "n";
      },
      close() {
        closed = true;
      },
    }),
  });

  const choice = await prompt.decider(createContext());
  prompt.close();

  expect(choice).toBe("yes");
  expect(prompts.length).toBe(2);
  expect(writes.join("")).toContain("Invalid choice. Use y, n, a, or q.");
  expect(writes.join("")).toContain("Change 1/2");
  expect(closed).toBe(true);
});
