import { bench, group, summary } from "mitata";
import { searchProject } from "../src/sgrep/sgrep.ts";
import { patchProject } from "../src/spatch/spatch.ts";
import { createTsFixture } from "./suites/fixtures.ts";

export function defineBenches(): void {
  summary(() => {
    group("sgrep", () => {
      const pattern = "const :[name] = :[value];";

      bench(
        "sgrep: concurrency=1, isomorphisms=true",
        async function* () {
          const fixture = await createTsFixture({ fileCount: 250, linesPerFile: 20 });
          try {
            yield async () => {
              await searchProject(pattern, {
                cwd: fixture.root,
                scope: ".",
                isomorphisms: true,
                concurrency: 1,
              });
            };
          } finally {
            await fixture.dispose();
          }
        },
      );

      bench(
        "sgrep: concurrency=8, isomorphisms=true",
        async function* () {
          const fixture = await createTsFixture({ fileCount: 250, linesPerFile: 20 });
          try {
            yield async () => {
              await searchProject(pattern, {
                cwd: fixture.root,
                scope: ".",
                isomorphisms: true,
                concurrency: 8,
              });
            };
          } finally {
            await fixture.dispose();
          }
        },
      );

      bench(
        "sgrep: concurrency=8, isomorphisms=false",
        async function* () {
          const fixture = await createTsFixture({ fileCount: 250, linesPerFile: 20 });
          try {
            yield async () => {
              await searchProject(pattern, {
                cwd: fixture.root,
                scope: ".",
                isomorphisms: false,
                concurrency: 8,
              });
            };
          } finally {
            await fixture.dispose();
          }
        },
      );
    });

    group("spatch", () => {
      const patch = [
        "-const :[name] = :[value];",
        "+let :[name] = :[value];",
      ].join("\n");

      bench(
        "spatch: dry-run (concurrency=1)",
        async function* () {
          const fixture = await createTsFixture({ fileCount: 250, linesPerFile: 20 });
          try {
            yield async () => {
              await patchProject(patch, {
                cwd: fixture.root,
                scope: ".",
                dryRun: true,
                concurrency: 1,
              });
            };
          } finally {
            await fixture.dispose();
          }
        },
      );

      bench(
        "spatch: dry-run (concurrency=8)",
        async function* () {
          const fixture = await createTsFixture({ fileCount: 250, linesPerFile: 20 });
          try {
            yield async () => {
              await patchProject(patch, {
                cwd: fixture.root,
                scope: ".",
                dryRun: true,
                concurrency: 8,
              });
            };
          } finally {
            await fixture.dispose();
          }
        },
      );
    });
  });
}
