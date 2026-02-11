#!/usr/bin/env node
import { formatSearchOutput, runSearchCommand } from "./command.ts";

type Flags = {
  cwd?: string;
  json?: boolean;
  "no-color"?: boolean;
  "no-isomorphisms"?: boolean;
  concurrency?: number;
  verbose?: number;
};

function parseNumberFlag(name: string, raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.floor(value);
}

function readFlagValue(argv: string[], index: number): { value: string; consumed: number } {
  const token = argv[index];
  if (!token) {
    throw new Error("Missing flag token");
  }

  const eqIndex = token.indexOf("=");
  if (eqIndex >= 0) {
    const value = token.slice(eqIndex + 1);
    if (value.length === 0) {
      throw new Error(`Missing value for ${token.slice(0, eqIndex)}`);
    }
    return { value, consumed: 1 };
  }

  const next = argv[index + 1];
  if (!next) {
    throw new Error(`Missing value for ${token}`);
  }
  return { value: next, consumed: 2 };
}

function printHelp(): void {
  process.stdout.write(
    [
      "sgrep - structural grep for TS/JS",
      "",
      "Usage:",
      "  sgrep [--json] [--no-color] [--no-isomorphisms] [--cwd <path>] <pattern-input> [scope]",
      "",
      "Flags:",
      "  --json               Output structured JSON",
      "  --no-color           Disable colored output",
      "  --no-isomorphisms    Disable isomorphism expansion",
      "  --cwd <path>         Working directory for resolving pattern and scope",
      "  --concurrency <n>    Max files processed concurrently (default: 8)",
      "  --verbose <level>    Perf tracing to stderr (1=summary, 2=slow files)",
      "",
    ].join("\n"),
  );
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const flags: Flags = {};
const positional: string[] = [];

for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token) continue;

  if (!token.startsWith("-")) {
    positional.push(token);
    continue;
  }

  if (token === "--json") {
    flags.json = true;
    continue;
  }
  if (token === "--no-color") {
    flags["no-color"] = true;
    continue;
  }
  if (token === "--no-isomorphisms") {
    flags["no-isomorphisms"] = true;
    continue;
  }

  if (token === "--cwd" || token.startsWith("--cwd=")) {
    const { value, consumed } = readFlagValue(argv, i);
    flags.cwd = token.includes("=") ? value : value;
    i += consumed - 1;
    continue;
  }
  if (token === "--concurrency" || token.startsWith("--concurrency=")) {
    const { value, consumed } = readFlagValue(argv, i);
    flags.concurrency = parseNumberFlag("--concurrency", value);
    i += consumed - 1;
    continue;
  }
  if (token === "--verbose" || token.startsWith("--verbose=")) {
    const { value, consumed } = readFlagValue(argv, i);
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0) {
      throw new Error("--verbose must be a non-negative number");
    }
    flags.verbose = Math.floor(level);
    i += consumed - 1;
    continue;
  }

  throw new Error(`Unknown flag: ${token}`);
}

const patternInput = positional[0];
const scope = positional[1];
if (!patternInput) {
  printHelp();
  process.exit(1);
}
if (positional.length > 2) {
  throw new Error("Too many positional arguments.");
}

const result = await runSearchCommand(patternInput, scope, flags);
if (flags.json ?? false) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const output = formatSearchOutput(result, {
    color: Boolean(process.stdout.isTTY) && !(flags["no-color"] ?? false),
  });
  if (output.length > 0) {
    process.stdout.write(`${output}\n`);
  }
}
