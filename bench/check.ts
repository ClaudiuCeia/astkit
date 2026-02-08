import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Baseline = {
  version: number;
  bunVersion: string;
  createdAt: string;
  results: Array<{ name: string; avg: number; p50: number; p99: number; kind: string }>;
};

type CurrentRun = {
  version: number;
  bunVersion: string;
  createdAt: string;
  results: Array<{ name: string; avg: number; p50: number; p99: number; kind: string }>;
};

function parseArgs(argv: string[]): { tolerance: number; init: boolean } {
  let tolerance = 0.2;
  let init = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tolerance") {
      const value = Number(argv[i + 1]);
      i += 1;
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--tolerance must be a non-negative number");
      }
      tolerance = value;
    }
    if (arg === "--init") {
      init = true;
    }
  }
  return { tolerance, init };
}

async function runBenchesJson(): Promise<CurrentRun> {
  const proc = Bun.spawn(
    ["bun", "run", "bench/run.ts", "--json"],
    { stdout: "pipe", stderr: "inherit" },
  );
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`bench runner failed with exit code ${exitCode}`);
  }
  return JSON.parse(text) as CurrentRun;
}

function indexResults(results: Array<{ name: string; avg: number; p50: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of results) {
    // p50 tends to be more stable than avg for noisy async benches.
    map.set(r.name, r.p50);
  }
  return map;
}

const args = parseArgs(process.argv.slice(2));
const baselinePath = path.join(process.cwd(), "bench", "baseline.json");

let baseline: Baseline;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
} catch {
  if (!args.init) {
    throw new Error(
      `Missing baseline at ${baselinePath}. Run: bun run bench:baseline (or re-run with --init)`,
    );
  }

  const initProc = Bun.spawn(
    ["bun", "run", "bench/baseline.ts"],
    { stdout: "inherit", stderr: "inherit" },
  );
  const initExit = await initProc.exited;
  if (initExit !== 0) {
    throw new Error(`baseline init failed with exit code ${initExit}`);
  }

  baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
}

const current = await runBenchesJson();

const baselineByName = indexResults(baseline.results);
const currentByName = indexResults(current.results);

const regressions: Array<{
  name: string;
  baseline: number;
  current: number;
  allowed: number;
}> = [];

for (const [name, base] of baselineByName) {
  const cur = currentByName.get(name);
  if (cur === undefined) {
    continue;
  }
  const allowed = base * (1 + args.tolerance);
  if (cur > allowed) {
    regressions.push({
      name,
      baseline: base,
      current: cur,
      allowed,
    });
  }
}

if (regressions.length > 0) {
  const lines: string[] = [];
  lines.push(`Performance regressions (tolerance=${args.tolerance}):`);
  for (const r of regressions) {
    lines.push(
      `${r.name}: ${r.current.toFixed(0)} > ${r.allowed.toFixed(0)} (baseline ${r.baseline.toFixed(0)})`,
    );
  }
  console.error(lines.join("\n"));
  process.exit(1);
}

// Keep a "last run" for debugging.
await writeFile(
  path.join(process.cwd(), "bench", "last-run.json"),
  JSON.stringify({ ...current, comparedTo: baseline.createdAt }, null, 2) + "\n",
  "utf8",
);

console.log("Bench check passed.");
