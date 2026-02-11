# @claudiu-ceia/nav

TypeScript language-service based navigation, declarations, references, and symbol ranking tooling.

## CLI

```sh
npx @claudiu-ceia/nav --help
```

Commands:

```sh
npx @claudiu-ceia/nav declarations [--json] [--no-color] <file>
npx @claudiu-ceia/nav definition <file>:<line>:<character>
npx @claudiu-ceia/nav references <file>:<line>:<character>
npx @claudiu-ceia/nav code-rank [--json] [--limit <n>] [--cwd <path>] [scope]
```

Notes:

- `declarations` default output is compact text; use `--json` for structured output.
- `definition` and `references` output structured JSON.
- `<line>` and `<character>` are 1-indexed.

## Programmatic API

```ts
import {
  createService,
  fromPosition,
  relativePath,
  toPosition,
  parseFilePosition,
  getDeclarations,
  formatDeclarationsOutput,
  getDefinition,
  getReferences,
  runCodeRankCommand,
  formatCodeRankOutput,
  rankCode,
  type FilePosition,
  type CodeRankOptions,
  type CodeRankResult,
  type RankedSymbol,
} from "@claudiu-ceia/nav";
```

Also exported for CLI embedding/integration:

- `declarationsCommand`
- `definitionCommand`
- `referencesCommand`
- `codeRankCommand`
