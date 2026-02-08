import { run } from "mitata";
import { defineBenches } from "./suite.ts";

function parseArgs(argv: string[]): {
  json: boolean;
  filter?: RegExp;
} {
  let json = false;
  let filter: RegExp | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--filter") {
      const value = argv[i + 1];
      i += 1;
      if (!value) {
        throw new Error("--filter requires a value");
      }
      filter = new RegExp(value, "i");
      continue;
    }
  }

  return { json, filter };
}

const args = parseArgs(process.argv.slice(2));

defineBenches();

if (args.json) {
  const result = await run({
    format: "quiet",
    filter: args.filter,
    colors: false,
  });

  // Persist only stable-ish summary stats for baseline comparisons.
  const flattened = result.benchmarks.flatMap((trial) =>
    trial.runs
      .filter((r) => r.stats)
      .map((r) => ({
        name: `${trial.alias}::${r.name}`,
        // mitata uses a high-res clock; treat stats values as nanoseconds.
        avg: r.stats!.avg,
        p50: r.stats!.p50,
        p99: r.stats!.p99,
        kind: r.stats!.kind,
      })),
  );

  process.stdout.write(
    JSON.stringify(
      {
        version: 1,
        bunVersion: Bun.version,
        createdAt: new Date().toISOString(),
        results: flattened.sort((a, b) => a.name.localeCompare(b.name)),
      },
      null,
      2,
    ) + "\n",
  );
} else {
  await run({
    format: { mitata: { name: "longest" } },
    filter: args.filter,
    colors: process.stdout.isTTY,
  });
}

