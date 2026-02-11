# astkit

`astkit` is a token-efficient, reproducible structural search/patch toolkit for TypeScript/JavaScript that can be run manually, in CI, or by an agent.
It operates on AST structure, TypeScript type services, and reference graphs.

## What astkit provides

- Definition and reference navigation via the TypeScript language service
- Structural search and rewrite using AST-shaped patterns
- Reference-based symbol ranking as an impact heuristic

## Non-Goals

`astkit` does not:

- infer program intent or meaning
- perform whole-program flow analysis
- prove correctness or enforce architecture
- replace the TypeScript compiler or type checker
- make decisions automatically
- guarantee behavioral equivalence after rewrites

## Install

```bash
npm install --save-dev @claudiu-ceia/astkit typescript
```

`astkit` uses the project's `typescript` installation for type services.

You can also install individual tools:

```bash
npm install --save-dev @claudiu-ceia/sgrep
npm install --save-dev @claudiu-ceia/spatch
npm install --save-dev @claudiu-ceia/nav typescript
```

## Run

```bash
npx @claudiu-ceia/astkit <command> [args]
```

Or via the bin entry:

```bash
astkit <command> [args]
```

## Install Skill (Codex)

From an installed npm package:

```bash
npx skills@latest add ./node_modules/@claudiu-ceia/astkit/skills/astkit-tooling -a codex -y
```

From this repository:

```bash
npm run skill:install
```

## CLI Reference

General help:

```bash
astkit --help
astkit <command> --help
```

Full command surface:

```bash
astkit nav declarations <file>
astkit nav definition <location>
astkit nav references <location>
astkit search [--json] [--no-color] [--no-isomorphisms] [--cwd <path>] [--concurrency <n>] [--verbose <level>] <pattern-input> [scope]
astkit patch [--interactive] [--json] [--no-color] [--dry-run] [--check] [--cwd <path>] [--concurrency <n>] [--verbose <level>] <patch-input> [scope]
astkit code-rank [--json] [--limit <n>] [--cwd <path>] [scope]
```

### `nav`

```bash
astkit nav declarations <file>
astkit nav definition <location>
astkit nav references <location>
```

`<location>` format:

- `path/to/file.ts:120:17`

Line and character are 1-indexed.

Mock execution:

```bash
$ astkit nav declarations src/__tests__/fixtures/simple.ts
{
  "file": "src/__tests__/fixtures/simple.ts",
  "declarations": [
    {
      "name": "User",
      "kind": "interface",
      "signature": "User",
      "line": 1
    },
    {
      "name": "UserService",
      "kind": "class",
      "signature": "UserService",
      "line": 7
    }
  ]
}

$ astkit nav definition src/__tests__/fixtures/importer.ts:1:15
{
  "symbol": "User",
  "definitions": [
    {
      "file": "src/__tests__/fixtures/simple.ts",
      "line": 1,
      "character": 18,
      "kind": "interface",
      "containerName": "\".../simple\""
    }
  ]
}

$ astkit nav references src/__tests__/fixtures/simple.ts:1:18
{
  "symbol": "interface User",
  "definition": {
    "file": "src/__tests__/fixtures/simple.ts",
    "line": 1,
    "character": 18
  },
  "references": [
    {
      "file": "src/__tests__/fixtures/simple.ts",
      "line": 1,
      "character": 18,
      "isDefinition": true,
      "isWriteAccess": true
    },
    {
      "file": "src/__tests__/fixtures/importer.ts",
      "line": 1,
      "character": 15,
      "isDefinition": false,
      "isWriteAccess": true
    }
  ]
}
```

### `search` (`sgrep`)

```bash
astkit search <pattern-input> [scope] [--cwd <path>] [--no-color] [--no-isomorphisms] [--json] [--concurrency <n>] [--verbose <level>]
```

- Default output is compact, file-grouped text
- In interactive terminals, captures are colorized
- `--no-color` disables coloring
- Isomorphism expansion is enabled by default (commutative binary operators, object-literal key order, redundant parentheses)
- `--no-isomorphisms` disables isomorphism expansion
- `--json` prints structured result
- `--concurrency` controls max files processed in parallel
- `--verbose` enables perf tracing logs (1=summary, 2=adds slow files)

Examples:

```bash
# inline pattern
astkit search 'const :[name] = :[value];' src

# pattern loaded from file
astkit search rules/find-const.sgrep src --cwd /repo

# machine output
astkit search --json 'const :[name] = :[value];' src
```

Mock execution:

```bash
$ astkit search 'const :[name] = :[value];' src
//src/example.ts
12: const foo = 42;
27: const bar = makeValue( ...

$ astkit search --json 'const :[name] = :[value];' src
{
  "scope": "/repo/src",
  "pattern": "const :[name] = :[value];",
  "filesScanned": 24,
  "filesMatched": 2,
  "totalMatches": 3,
  "files": [
    {
      "file": "src/example.ts",
      "matchCount": 2,
      "matches": [
        {
          "line": 12,
          "character": 1,
          "matched": "const foo = 42;",
          "captures": {
            "name": "foo",
            "value": "42"
          }
        }
      ]
    }
  ]
}
```

### `patch` (`spatch`)

```bash
astkit patch <patch-input> [scope] [--cwd <path>] [--dry-run] [--check] [--json] [--no-color] [--interactive] [--concurrency <n>] [--verbose <level>]
```

- `patch-input` can be inline patch text or a file path
- Patch format uses `+`/`-`/context lines in one document
- Default output is compact diff-style text
- `--check` exits non-zero if replacements would be made (CI guardrail)
- `--json` prints structured output
- `--no-color` disables color in compact output
- `--interactive` lets you accept/reject each match
- `--concurrency` controls max files processed in parallel
- `--verbose` enables perf tracing logs (1=summary, 2=adds slow files)

Example:

```bash
astkit patch $'-const :[name] = :[value];\n+let :[name] = :[value];' src
```

Notes:

- In bash/zsh, `$'...'` enables `\n` escapes for multi-line patch documents. Alternatively, pass a patch file path as `<patch-input>`.

Mock execution:

```bash
$ astkit patch --dry-run $'-const :[name] = :[value];\n+let :[name] = :[value];' src
diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -12,1 +12,1 @@
-const foo = 42;
+let foo = 42;
1 file changed, 1 replacement, (dry-run)

$ astkit patch --interactive $'-const :[name] = :[value];\n+let :[name] = :[value];' src
------------------------------------------------------------------------
Change 1/2: src/example.ts:12
@@ -12,1 +12,1 @@
-const foo = 42;
+let foo = 42;
Choice [y/n/a/q] (default: n): y
```

### `code-rank`

```bash
astkit code-rank [scope] [--cwd <path>] [--limit <n>] [--json]
```

- Ranks exported symbols by TypeScript reference strength
- Uses the TypeScript language service (`findReferences`)
- Default output is compact, one symbol per line
- `--json` prints structured output

Example:

```bash
astkit code-rank src --limit 20
```

Mock execution:

```bash
$ astkit code-rank src --limit 3
1. score=14 refs=3 ext=3 files=2 function hot src/a.ts:1:8
2. score=9 refs=2 ext=2 files=1 function warm src/a.ts:5:8
3. score=6 refs=1 ext=1 files=1 interface User src/model.ts:1:18

$ astkit code-rank src --limit 1 --json
{
  "scope": "/repo/src",
  "symbolsRanked": 1,
  "symbols": [
    {
      "symbol": "hot",
      "kind": "function",
      "file": "src/a.ts",
      "line": 1,
      "character": 8,
      "score": 14,
      "referenceCount": 3
    }
  ]
}
```

## Structural Pattern Syntax

Both `search` and `patch` use the same hole/metavariable syntax:

- `:[name]`
- `:[_]` anonymous hole (ignored in captures)
- `:[name~regex]` regex-constrained hole
- `...` variadic wildcard (matches balanced text and can be reused in replacement)

Repeated named holes enforce equality:

```text
:[x] + :[x]
```

This matches `foo + foo` but not `foo + bar`.

Hole captures are structurally balanced (brackets/strings/comments), which helps avoid malformed partial matches.

Regex-constrained holes intentionally use a safe subset:

- max regex constraint length: `256`
- disallowed constructs: lookarounds, backreferences, nested quantified groups
- constrained captures longer than `2048` characters are rejected

## Output Examples

Default compact `search` output:

```text
//src/example.ts
12: const foo = 42;
34: const bar = compute( ...
```

JSON `search` output (`--json`) includes:

- files scanned/matched
- total matches
- byte spans
- line/character
- captures

`patch --json` includes structured match and replacement stats per file.

## Programmatic API

`@claudiu-ceia/astkit` is a meta package that re-exports public APIs from:

- `@claudiu-ceia/spatch`
- `@claudiu-ceia/sgrep`
- `@claudiu-ceia/nav`

```ts
import { patchProject, rankCode, searchProject } from "@claudiu-ceia/astkit";
```

See package-specific documentation:

- `packages/spatch/README.md`
- `packages/sgrep/README.md`
- `packages/nav/README.md`

## Development

Run local CLI:

```bash
bun run astkit -- <command> [args]
```

Build distributable output:

```bash
npm run build
```

Run tests:

```bash
bun test
```

Run typecheck:

```bash
npm run typecheck
```

Preview npm package contents:

```bash
npm run pack:check
```

Install this repo's skill locally for Codex:

```bash
npm run skill:install
```

## Code Organization

- `packages/astkit/src/*`: top-level CLI app and package re-exports
- `packages/nav/src/*`: TypeScript language-service navigation and code-rank commands
- `packages/sgrep/src/*`: search pipeline (`parse -> search -> output`)
- `packages/spatch/src/*`: patch pipeline (`parse -> rewrite -> output`)
- `packages/astkit-core/src/*`: shared matching/parsing/filesystem utilities
