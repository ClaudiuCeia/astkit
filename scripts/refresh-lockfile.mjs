import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync("bun.lock", { force: true });

const result = spawnSync("bun", ["install", "--lockfile-only"], {
  stdio: "inherit",
});
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
