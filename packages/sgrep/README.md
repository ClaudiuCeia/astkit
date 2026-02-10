# sgrep

`sgrep` performs structural search over source files using hole/metavariable syntax.

Pattern input can be:
- inline pattern text
- a file path (resolved from `cwd`)

## CLI

```bash
astkit search <pattern-input> [scope] [--cwd <path>] [--no-color] [--no-isomorphisms] [--json]
```

Examples:

```bash
# inline pattern
astkit search 'const :[name] = :[value];' src

# pattern from file
astkit search rules/find-const.sgrep src --cwd /repo
```

## Isomorphisms

`sgrep` expands the pattern through a small isomorphism engine before matching.

Default rules:
- `commutative-binary`: swaps operands for commutative operators (`+`, `*`, `&`, `|`, `^`, `==`, `===`, `!=`, `!==`)
- `object-literal-property-order`: swaps adjacent object literal `key: value` entries when safe
- `redundant-parentheses`: adds/removes extra parentheses around binary expressions

Disable all isomorphisms with:

```bash
astkit search 'const total = :[x] + :[y];' src --no-isomorphisms
```

Developer notes:
- Rule registry: `src/sgrep/isomorphisms/registry.ts`
- Rule interface: `src/sgrep/isomorphisms/types.ts`
- Expansion engine: `src/sgrep/isomorphisms/expand.ts`
- Adding a new isomorphism only requires creating one rule file and registering it.
- Patterns containing template wildcard `...` skip AST isomorphism expansion (to avoid ambiguity with JS spread syntax).

## Metavariables

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

Example with variadic wildcard:

```text
foo(:[x], ..., :[y])
```

Matches calls where `:[x]` is the first argument and `:[y]` is the last argument.

## Structural balancing

Hole captures are required to be structurally balanced:

- parentheses/brackets/braces
- quoted strings (single/double/template)
- line and block comments

This prevents partial malformed captures.

## Result format

`searchProject` returns:

- scope, pattern
- files scanned/matched
- total matches
- elapsed time
- per-file matches with:
  - byte spans (`start`, `end`)
  - `line`, `character`
  - matched text
  - captures map
