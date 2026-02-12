# astkit

`astkit` is the umbrella package for structural and type-aware TS/JS tooling.

It bundles four command families behind one CLI:

- `nav`: declarations, definition, references
- `search` (`sgrep`): structural grep
- `patch` (`spatch`): structural rewrite
- `code-rank`: reference-based symbol ranking

## Install

```bash
npm install --save-dev @claudiu-ceia/astkit typescript
```

`astkit` uses the target project's `typescript` installation for language-service operations.

## Run

```bash
npx @claudiu-ceia/astkit --help
# or
astkit --help
```

## Command surface

```bash
astkit nav declarations [--json] [--no-color] <file>
astkit nav definition <file>:<line>:<character>
astkit nav references <file>:<line>:<character>
astkit code-rank [--json] [--limit <n>] [--cwd <path>] [scope]

astkit search \
  [--json] \
  [--no-color] \
  [--no-isomorphisms] \
  [--cwd <path>] \
  [--concurrency <n>] \
  [--verbose <level>] \
  <pattern-input> [scope]

astkit patch \
  [--interactive] \
  [--json] \
  [--no-color] \
  [--dry-run] \
  [--check] \
  [--cwd <path>] \
  [--concurrency <n>] \
  [--verbose <level>] \
  <patch-input> [scope]
```

Location syntax for nav commands:

- `<file>:<line>:<character>`
- line and character are 1-indexed

## Quick examples

```bash
# structural search
astkit search 'const :[name] = :[value];' src

# structural rewrite preview
astkit patch --dry-run rules/const-to-let.spatch src

# go to definition
astkit nav definition src/main.ts:42:17

# rank high-impact exports
astkit code-rank src --limit 20
```

## Output modes

- Default output is compact human-readable text (optimized for terminal and LLM workflows).
- `--json` is available for machine consumers and automation.

## Safety model (high level)

- Scope and input paths are constrained to the nearest git repository root when available.
- If no git root is found, paths are constrained to `cwd`.
- Escape and symlink boundary checks are enforced for path-based operations.

## Programmatic API

`@claudiu-ceia/astkit` is a meta package that re-exports public APIs from:

- `@claudiu-ceia/spatch`
- `@claudiu-ceia/sgrep`
- `@claudiu-ceia/nav`

Example:

```ts
import { getReferences, patchProject, rankCode, searchProject } from "@claudiu-ceia/astkit";
```

## Deep-dive docs

For full syntax and contracts, use package-specific docs:

- `@claudiu-ceia/sgrep`: `packages/sgrep/README.md`
- `@claudiu-ceia/spatch`: `packages/spatch/README.md`
- `@claudiu-ceia/nav`: `packages/nav/README.md`

## Development

```bash
bun run astkit -- --help
bun run typecheck
bun run build
bun run test
bun run format:check
```
