# @claudiu-ceia/nav

TypeScript language-service navigation utilities for exported declarations, definitions, references, and symbol ranking.

## Install

```bash
npm install --save-dev @claudiu-ceia/nav typescript
```

`@claudiu-ceia/nav` uses the target project's `typescript` installation.

## CLI

```bash
npx @claudiu-ceia/nav --help
# or
nav --help
```

## Command surface

```bash
nav declarations [--json] [--no-color] <file>
nav definition <file>:<line>:<character>
nav references <file>:<line>:<character>
nav code-rank [--json] [--limit <n>] [--cwd <path>] [scope]
```

Location syntax:

- `<file>:<line>:<character>`
- line and character are 1-indexed

## Output modes

- `declarations`: compact text by default, `--json` for structured output.
- `definition`: structured JSON output.
- `references`: structured JSON output.
- `code-rank`: compact text by default, `--json` for structured output.

## Quick examples

```bash
# list exported declarations from a file
nav declarations src/index.ts

# get symbol definition at a location
nav definition src/main.ts:42:17

# list references for a symbol at a location
nav references src/main.ts:42:17

# rank exported symbols by reference strength
nav code-rank src --limit 20
```

## Safety model

- File and scope paths are constrained to the nearest git repository root when available.
- If no git root is found, paths are constrained to `cwd`.
- Path escape and symlink boundary checks are enforced for path-based operations.

## Programmatic API

```ts
import {
  codeRankCommand,
  createService,
  declarationsCommand,
  definitionCommand,
  formatCodeRankOutput,
  formatDeclarationsOutput,
  fromPosition,
  getDeclarations,
  getDefinition,
  getReferences,
  parseFilePosition,
  rankCode,
  referencesCommand,
  relativePath,
  runCodeRankCommand,
  toPosition,
  type CodeRankOptions,
  type CodeRankResult,
  type FilePosition,
  type RankedSymbol,
} from "@claudiu-ceia/nav";
```

Core APIs:

- `getDeclarations(filePath)`: exported declarations/signatures for one file.
- `getDefinition(filePath, line, character)`: definition target at one source location.
- `getReferences(filePath, line, character)`: references for one source location.
- `rankCode({ cwd?, scope?, limit? })`: rank exported symbols by reference strength.

CLI integration exports:

- `declarationsCommand`
- `definitionCommand`
- `referencesCommand`
- `codeRankCommand`

## Development

From monorepo root:

```bash
bun run nav -- --help
bun test packages/nav/__tests__
bun test --coverage packages/nav/__tests__
bun run typecheck
```
