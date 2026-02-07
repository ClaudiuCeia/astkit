# semantic

CLI tool providing semantic code intelligence for LLM agents working with TypeScript projects.

## Problem

LLM agents waste context window budget on:
- **regex search**: noisy, misses structural patterns, returns irrelevant matches
- **manual patching**: opening files one by one, applying changes per callsite — slow, incomplete
- **reading full files**: implementation detail floods context when only the public API matters

## Solution

Three tool categories exposed as CLI subcommands:

### `nav` — code navigation and reading
Read code through declarations and type signatures, not raw file contents.

- `semantic nav declarations <file>` — list exported signatures (no bodies)
- `semantic nav definition <file> <line> <character>` — go to definition
- `semantic nav references <file> <line> <character>` — find all references

### `search` — syntactic/semantic grep
Structural pattern matching that understands code syntax.

- `semantic search <pattern> [scope]` — syntactic structural search
- `semantic search --type <type-query> [scope]` — type-aware search (TS compiler)

### `patch` — syntactic/semantic rewrite
Structural code transformation using pattern matching.

- `semantic patch <pattern> <replacement> [scope]` — structural rewrite
- `semantic patch --dry-run <pattern> <replacement> [scope]` — preview changes

## Design principles

- **Compact output.** Every byte lands in a context window. No ANSI, no decoration.
- **JSON by default.** Structured output for programmatic consumption.
- **Span-based addressing.** Everything speaks in `file:line:character` or `file:startLine-endLine`.
- **Scoped operations.** Every command accepts file/directory scope.
- **Dry-run for patches.** Preview what changes before committing them.
- **Runtime-agnostic.** Uses standard Node.js APIs (`node:fs`, `node:path`). Works with Node and Bun.

## Tech stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Code navigation | TypeScript compiler API | Language service for declarations, definitions, references |
| Structural patching | `@claudiu-ceia/combine` | Comby-inspired structural matching/rewriting |
| Structural search | TBD | Likely ast-grep or tree-sitter queries |
| CLI framework | `stricli` | Zero deps, TS-first, nested subcommands, lazy loading |
| Target runtime | Node.js >=18 / Bun | No runtime-specific APIs in the tool itself |

## Distribution

npm package with a `bin` entry point. Users install as a devDependency or run via `npx`/`bunx`. Uses the target project's own `typescript` installation for accurate type resolution.

---

## Development

### Setup
```sh
bun install
```

### Running
```sh
bun run src/cli.ts <command> [args]
```

### Testing
```sh
bun test
```

### Conventions
- Use standard Node.js APIs — not Bun-specific builtins (`Bun.file`, `bun:sqlite`, etc.)
- Use `bun test` with `import { test, expect } from "bun:test"` for tests
- TypeScript strict mode
- Prefer small, focused modules — one command per file
- Use semantic commit messages (e.g., `feat: add nav declarations command`, `fix: correct line/character parsing in nav definition`)
