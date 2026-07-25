import { bench, group, summary } from "mitata";
import { searchProject } from "@claudiu-ceia/sgrep";
import { patchProject } from "@claudiu-ceia/spatch";
import { findTemplateMatches } from "../packages/astkit-core/src/pattern/match.ts";
import {
  compileReplacementTemplate,
  renderCompiledTemplate,
} from "../packages/astkit-core/src/pattern/render.ts";
import { compileTemplate } from "../packages/astkit-core/src/pattern/syntax.ts";
import { createTsFixture } from "./suites/fixtures.ts";

export function defineBenches(): void {
  summary(() => {
    group("core matcher", () => {
      const pattern = compileTemplate("start(:[first] MID :[second] END)");
      const source = `start(${"value MID ".repeat(1_000)}value)`;

      bench("core matcher: repeated late-literal miss", () => {
        findTemplateMatches(source, pattern);
      });
    });

    group("layout rendering", () => {
      const replacement = compileReplacementTemplate(
        "const :[name] = build(:[left], :[right], { enabled: true });",
      );
      const captures = { name: "result", left: "first", right: "second" };
      const source = "const /* keep */ result=build( first,second,{enabled:true});";

      bench("layout rendering: preserve trivia", () => {
        renderCompiledTemplate(replacement, captures, { preserveLayoutFrom: source });
      });
    });

    group("sgrep", () => {
      const pattern = "const :[name] = :[value];";

      bench("sgrep: concurrency=1, isomorphisms=true", async function* () {
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
      });

      bench("sgrep: concurrency=8, isomorphisms=true", async function* () {
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
      });

      bench("sgrep: concurrency=8, isomorphisms=false", async function* () {
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
      });
    });

    group("spatch", () => {
      const patch = ["-const :[name] = :[value];", "+let :[name] = :[value];"].join("\n");

      bench("spatch: dry-run (concurrency=1)", async function* () {
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
      });

      bench("spatch: dry-run (concurrency=8)", async function* () {
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
      });
    });
  });
}
