# sgrep

`sgrep` performs structural search over source files using hole/metavariable syntax.

Pattern input can be:
- inline pattern text
- a file path (resolved from `cwd`)

## CLI

```bash
semantic search <pattern-input> [scope] [--cwd <path>]
```

Examples:

```bash
# inline pattern
semantic search 'const :[name] = :[value];' src

# pattern from file
semantic search rules/find-const.sgrep src --cwd /repo
```

## Metavariables

Supported syntax is shared with `spatch` templates:

- `:[name]`
- `:[_]` anonymous hole (not captured)
- `:[name~regex]` regex-constrained hole

Repeated named holes enforce equality:

```text
:[x] + :[x]
```

Matches `foo + foo`, not `foo + bar`.

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
