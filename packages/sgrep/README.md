# sgrep

`sgrep` performs structural search over TS/JS source files using metavariable templates.

Pattern input can be:

- inline pattern text
- a file path (resolved from `cwd`)

## Install

```bash
npm install --save-dev @claudiu-ceia/sgrep
```

## CLI

```bash
sgrep \
  [--json] \
  [--no-color] \
  [--no-isomorphisms] \
  [--cwd <path>] \
  [--concurrency <n>] \
  [--verbose <level>] \
  <pattern-input> [scope]

# through umbrella CLI
astkit search \
  [--json] \
  [--no-color] \
  [--no-isomorphisms] \
  [--cwd <path>] \
  [--concurrency <n>] \
  [--verbose <level>] \
  <pattern-input> [scope]
```

Flags:

- `--json`: output structured JSON
- `--no-color`: disable colored output in compact text mode
- `--no-isomorphisms`: disable isomorphism expansion
- `--cwd <path>`: working directory for resolving pattern file and scope
- `--concurrency <n>`: max files processed concurrently (default: `8`)
- `--verbose <level>`: perf tracing to stderr (`1=summary`, `2=includes slow files`)

## Quick examples

```bash
# inline pattern
sgrep 'const :[name] = :[value];' src

# pattern from file
sgrep rules/find-const.sgrep src --cwd /repo

# inspect expanded-match behavior and perf tracing
sgrep 'const obj = { a: :[x], b: :[y] };' src --verbose 2
```

## Pattern syntax

Supported syntax is shared with `spatch` templates:

- `:[name]`
- `:[_]` anonymous hole (not captured)
- `:[name~regex]` regex-constrained hole
- `...` variadic wildcard

Repeated named holes enforce equality:

```text
:[x] + :[x]
```

Matches `foo + foo`, not `foo + bar`.

Regex-constrained holes intentionally use a safe subset:

- max regex constraint length: `256`
- disallowed constructs: lookarounds, backreferences, nested quantified groups
- constrained captures longer than `2048` characters are rejected

Example with variadic wildcard:

```text
foo(:[x], ..., :[y])
```

Matches calls where `:[x]` is the first argument and `:[y]` is the last argument.

### Structural balancing

Hole captures are required to be structurally balanced:

- parentheses, brackets, and braces
- quoted strings (single, double, template)
- line and block comments

This prevents partial malformed captures.

## Isomorphisms

`sgrep` expands patterns through a small isomorphism engine before matching.

Default rules:

- `commutative-binary`: swaps operands for commutative operators (`+`, `*`, `&`, `|`, `^`, `==`, `===`, `!=`, `!==`)
- `object-literal-property-order`: swaps adjacent object-literal `key: value` entries when safe
- `redundant-parentheses`: adds and removes extra parentheses around binary expressions

Disable all isomorphisms with:

```bash
sgrep 'const total = :[x] + :[y];' src --no-isomorphisms
```

Patterns containing template wildcard `...` intentionally skip AST-based isomorphism expansion to avoid ambiguity with JS spread syntax.

## Output modes

- Default output is compact text grouped by file.
- `--json` returns the full result object for machine consumers.

## Safety model

- Scope and pattern-input file paths are constrained to the nearest git repository root when available.
- If no git root is found, paths are constrained to `cwd`.
- Compact output escapes control characters in matched previews and file paths.

## Programmatic API

```ts
import {
  DEFAULT_ISOMORPHISM_RULES,
  DEFAULT_SEARCH_EXCLUDED_DIRECTORIES,
  DEFAULT_SEARCHABLE_EXTENSIONS,
  expandPatternIsomorphisms,
  formatSearchOutput,
  runSearchCommand,
  searchProject,
  type ExpandIsomorphismsOptions,
  type IsomorphismRule,
  type SearchCommandFlags,
  type SgrepOptions,
  type SgrepResult,
} from "@claudiu-ceia/sgrep";
```

Core APIs:

- `searchProject(patternInput, options?)`
- `runSearchCommand(patternInput, scope, flags)` for CLI embedding
- `formatSearchOutput(result, { color? })` for compact text formatting
- `expandPatternIsomorphisms(pattern, options?)` for rule-driven expansion

## Result schema

`searchProject` and `runSearchCommand` return:

```ts
type SgrepResult = {
  scope: string;
  pattern: string;
  filesScanned: number;
  filesMatched: number;
  totalMatches: number;
  elapsedMs: number;
  files: Array<{
    file: string;
    matchCount: number;
    matches: Array<{
      start: number;
      end: number;
      line: number;
      character: number;
      matched: string;
      captures: Record<string, string>;
    }>;
  }>;
};
```

## Development

From monorepo root:

```bash
bun run sgrep -- --help
bun test packages/sgrep/__tests__
bun test --coverage packages/sgrep/__tests__
bun run typecheck
```
