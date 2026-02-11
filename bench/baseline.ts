import { writeFile } from "node:fs/promises";
import path from "node:path";

type CurrentRun = {
  version: number;
  bunVersion: string;
  createdAt: string;
  results: Array<{
    name: string;
    avg: number;
    p50: number;
    p99: number;
    kind: string;
  }>;
};

async function runBenchesJson(): Promise<CurrentRun> {
  const proc = Bun.spawn(["bun", "run", "bench/run.ts", "--json"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`bench runner failed with exit code ${exitCode}`);
  }
  return JSON.parse(text) as CurrentRun;
}

const current = await runBenchesJson();

await writeFile(
  path.join(process.cwd(), "bench", "baseline.json"),
  JSON.stringify(current, null, 2) + "\n",
  "utf8",
);

console.log("Wrote bench/baseline.json");
