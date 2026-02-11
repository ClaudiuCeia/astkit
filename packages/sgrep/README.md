# sgrep

`sgrep` performs structural search over TS/JS source files using hole/metavariable templates.

Pattern input can be:

- inline pattern text
- a file path (resolved from `cwd`)

## CLI

```bash
sgrep [--json] [--no-color] [--no-isomorphisms] [--cwd <path>] [--concurrency <n>] [--verbose <level>] <pattern-input> [scope]
# or:
astkit search [--json] [--no-color] [--no-isomorphisms] [--cwd <path>] [--concurrency <n>] [--verbose <level>] <pattern-input> [scope]
```

### Flags

- `--json`: output structured JSON
- `--no-color`: disable colored output in compact text mode
- `--no-isomorphisms`: disable isomorphism expansion
- `--cwd <path>`: working directory for resolving pattern file and scope
- `--concurrency <n>`: max files processed concurrently (default: `8`)
- `--verbose <level>`: perf tracing to stderr (`1=summary`, `2=includes slow files`)

### Examples

```bash
# inline pattern
sgrep 'const :[name] = :[value];' src

# pattern from file
sgrep rules/find-const.sgrep src --cwd /repo

# inspect expanded-match behavior and perf tracing
sgrep 'const obj = { a: :[x], b: :[y] };' src --verbose 2
```

## Pattern Syntax

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

- parentheses/brackets/braces
- quoted strings (single/double/template)
- line and block comments

This prevents partial malformed captures.

## Isomorphisms

`sgrep` expands patterns through a small isomorphism engine before matching.

Default rules:

- `commutative-binary`: swaps operands for commutative operators (`+`, `*`, `&`, `|`, `^`, `==`, `===`, `!=`, `!==`)
- `object-literal-property-order`: swaps adjacent object-literal `key: value` entries when safe
- `redundant-parentheses`: adds/removes extra parentheses around binary expressions

Disable all isomorphisms with:

```bash
sgrep 'const total = :[x] + :[y];' src --no-isomorphisms
```

Note: patterns containing template wildcard `...` skip AST-based isomorphism expansion to avoid ambiguity with JS spread syntax.

## Programmatic API

```ts
import {
  searchProject,
  sgrep,
  runSearchCommand,
  formatSearchOutput,
  expandPatternIsomorphisms,
  DEFAULT_ISOMORPHISM_RULES,
  DEFAULT_SEARCHABLE_EXTENSIONS,
  DEFAULT_SEARCH_EXCLUDED_DIRECTORIES,
  type SgrepOptions,
  type SgrepResult,
  type SearchCommandFlags,
  type ExpandIsomorphismsOptions,
  type IsomorphismRule,
} from "@claudiu-ceia/sgrep";
```

### `searchProject(patternInput, options?)` / `sgrep(patternInput, options?)`

```ts
function searchProject(patternInput: string, options?: SgrepOptions): Promise<SgrepResult>;
```

Primary API for structural search. `patternInput` may be inline text or a file path.

Key `SgrepOptions` fields:

- `scope?: string` default `"."`
- `cwd?: string`
- `isomorphisms?: boolean` default `true`
- `concurrency?: number` default `8`
- `verbose?: number` and `logger?: (line: string) => void`
- `extensions?: readonly string[]`
- `excludedDirectories?: readonly string[]`
- `encoding?: BufferEncoding` default `"utf8"`

### `runSearchCommand(patternInput, scope, flags)`

```ts
function runSearchCommand(
  patternInput: string,
  scope: string | undefined,
  flags: SearchCommandFlags,
): Promise<SgrepResult>;
```

CLI-facing wrapper that maps command flags into `searchProject` options.

### `formatSearchOutput(result, options?)`

```ts
function formatSearchOutput(result: SgrepResult, options?: { color?: boolean }): string;
```

Formats compact text output (`//file` headers and `line: preview` entries). Returns `""` when no matches are present.

### Isomorphism API

```ts
function expandPatternIsomorphisms(pattern: string, options?: ExpandIsomorphismsOptions): string[];
```

- `DEFAULT_ISOMORPHISM_RULES`: built-in rule registry
- `IsomorphismRule`: extension contract for custom rule sets

## Result Schema

`searchProject`/`runSearchCommand` return:

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
