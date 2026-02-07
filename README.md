# semantic

`semantic` is a CLI for code intelligence workflows used by LLM agents and developers in TypeScript/JavaScript projects.

It currently provides:
- `nav`: TypeScript language-service navigation
- `search`: structural pattern search (`sgrep`)
- `patch`: structural rewrite (`spatch`)

## Why this exists

LLM-driven editing workflows usually lose time and context budget on:
- regex-only search with noisy results
- manual multi-file patching
- reading full files when signatures or spans are enough

`semantic` focuses on compact, machine-usable output and structural matching.

## Install

```bash
bun install
```

## Run

```bash
bun run src/cli.ts <command> [args]
```

Or via the bin entry:

```bash
semantic <command> [args]
```

## CLI Overview

### `nav`

```bash
semantic nav declarations <file>
semantic nav definition <file> <line> <character>
semantic nav references <file> <line> <character>
```

All line/character positions are 1-indexed.

### `search` (`sgrep`)

```bash
semantic search <pattern-input> [scope] [--cwd <path>] [--no-color] [--json]
```

- Default output is compact, file-grouped text
- In interactive terminals, captures are colorized
- `--no-color` disables coloring
- `--json` prints full structured result

Examples:

```bash
# inline pattern
semantic search 'const :[name] = :[value];' src

# pattern loaded from file
semantic search rules/find-const.sgrep src --cwd /repo

# machine output
semantic search --json 'const :[name] = :[value];' src
```

### `patch` (`spatch`)

```bash
semantic patch <patch-input> [scope] [--cwd <path>] [--dry-run]
```

- `patch-input` can be inline patch text or a file path
- Patch format uses `+`/`-`/context lines in one document

Example:

```bash
semantic patch $'-const :[name] = :[value];\n+let :[name] = :[value];' src
```

## Structural Pattern Syntax

Both `search` and `patch` use the same hole/metavariable syntax:

- `:[name]`
- `:[_]` anonymous hole (ignored in captures)
- `:[name~regex]` regex-constrained hole

Repeated named holes enforce equality:

```text
:[x] + :[x]
```

This matches `foo + foo` but not `foo + bar`.

Hole captures are structurally balanced (brackets/strings/comments), which avoids malformed partial matches.

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

`patch` output is JSON by default, including match and replacement stats per file.

## Programmatic API

Root exports:
- `patchProject` from `src/spatch`
- `searchProject` from `src/sgrep`

```ts
import { patchProject, searchProject } from "semantic";
```

See detailed internals:
- `src/spatch/README.md`
- `src/sgrep/README.md`

## Development

Run tests:

```bash
bun test
```

Run typecheck:

```bash
bunx tsc --noEmit
```

## Code Organization

- `src/nav/*`: TypeScript language-service navigation commands
- `src/sgrep/*`: search pipeline (`parse -> search -> output`)
- `src/spatch/*`: patch pipeline (`parse -> rewrite -> output`)
- `src/pattern/*`: shared structural parser/matcher/renderer
- `src/common/*`: shared helpers (for example inline-or-file text resolution)
