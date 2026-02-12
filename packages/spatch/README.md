# spatch

Deterministic structural rewrites for TypeScript/JavaScript using a compact patch-document format.

`spatch` lets you describe a code change once and apply it safely across a scoped project.

## Install

```bash
npm install --save-dev @claudiu-ceia/spatch
```

Or run directly:

```bash
npx @claudiu-ceia/spatch --help
```

## Quickstart

Create a patch file:

```spatch
-const :[name] = :[value];
+let :[name] = :[value];
```

Preview:

```bash
spatch rules/const-to-let.spatch src --dry-run
```

Apply:

```bash
spatch rules/const-to-let.spatch src
```

CI guardrail:

```bash
spatch rules/const-to-let.spatch src --check
```

## Patch document format

A patch document is line-based:

- `-...` deletion line: belongs to the match pattern only
- `+...` addition line: belongs to the replacement only
- ` ...` context line: shared by both pattern and replacement
- `\-...` and `\+...` escaped markers: literal context starting with `-` or `+`

At least one `-` or `+` line is required.

If the patch document ends with a trailing newline, generated pattern and replacement preserve that newline.

Patch input can be:

- inline patch text
- a patch file path
- `-` to read from stdin

Examples:

```bash
# file input
spatch rules/rename.spatch src

# stdin input
cat rules/rename.spatch | spatch - src

# inline input (bash/zsh)
spatch $'-foo(:[x])\n+bar(:[x])' src
```

## Metavariables

Supported placeholders:

- `:[name]` named capture
- `:[_]` anonymous wildcard (not captured)
- `:[name~regex]` named capture constrained by regex
- `...` variadic wildcard, reusable in replacement

Examples:

```spatch
-const :[name~[a-zA-Z_$][\w$]*] = :[value];
+let :[name] = :[value];
```

```spatch
-transform(:[input], :[config], ...);
+normalize(:[input], :[config], ...);
```

Repeated names enforce equality:

```spatch
-:[x] + :[x]
+double(:[x])
```

Regex constraint safety limits:

- max regex constraint length: `256` characters
- disallowed in constraints: lookarounds, backreferences, nested quantified groups (for example `([a-z]+)+`)
- constrained captures longer than `2048` characters are rejected during matching

## Matching and formatting behavior

`spatch` matches structurally, not by raw text equality.

- matching is trivia-insensitive between lexemes (whitespace and comments can differ)
- captures are structurally balanced (parens, brackets, braces, strings, comments)
- `...` captures variadic middle segments

Formatting behavior:

- if replacement keeps the same lexical shape, original trivia layout is preserved
- if replacement changes lexical shape, output follows replacement template layout

Example rewrite:

```spatch
-transform(:[input], :[config], ...);
+normalize(:[input], :[config], ...);
```

```ts
// source
const call = transform(source /* keep comment */, cfg, optA, optB);

// after spatch
const call = normalize(source /* keep comment */, cfg, optA, optB);
```

## CLI

```bash
spatch \
  [--interactive] \
  [--json] \
  [--no-color] \
  [--dry-run] \
  [--check] \
  [--cwd <path>] \
  [--concurrency <n>] \
  [--verbose <level>] \
  <patch-input> [scope]

# through umbrella CLI
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

Flags:

- `--dry-run`: preview changes without writing files
- `--check`: fail with non-zero exit if replacements would be made (implies dry-run)
- `--interactive`: confirm each change (`y/n/a/q`)
- `--json`: emit structured JSON result
- `--no-color`: disable colored output
- `--cwd <path>`: working directory used to resolve patch input and scope
- `--concurrency <n>`: max files processed in parallel (default `8`)
- `--verbose <level>`: perf tracing (`1=summary`, `2=includes slow files`)

Notes:

- `--interactive` cannot be combined with `--dry-run` or `--check`
- run `spatch --help` for generated stricli help text

## Output modes

- Default output is compact diff-style text plus a summary line.
- `--json` returns the full `SpatchResult` object.

## Scope and safety model

Scope boundary:

- if `cwd` is inside a git repository, scope must stay within the nearest repo root
- if no git repo root is found, scope must stay within `cwd`

Write safety:

- non-interactive apply uses stale-content checks and atomic temp-file rename writes
- interactive mode re-validates selected spans, then writes through the same stale-safe atomic path

Compact output escapes control characters in paths and preview text.

## Programmatic API

```ts
import {
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_PATCHABLE_EXTENSIONS,
  patchProject,
  type SpatchOptions,
  type SpatchResult,
} from "@claudiu-ceia/spatch";
```

Example:

```ts
const result = await patchProject("rules/const-to-let.spatch", {
  cwd: "/repo",
  scope: "src",
  dryRun: true,
  encoding: "utf8",
  concurrency: 8,
  verbose: 1,
  logger: console.error,
});

console.log(result.totalReplacements);
```

`patchInput` can be patch text or a patch file path.

## Caveats

- matching is syntactic and structural, not semantic or type-aware
- comments and whitespace are preserved by lexical slot; when reordering captures, inline comments follow slot position
- very broad patterns can have large blast radius, so use `--dry-run` (and optionally `--interactive`) first

## Development

From monorepo root:

```bash
bun run spatch -- --help
bun run test:spatch
bun run test:spatch:coverage
bun run typecheck
```
