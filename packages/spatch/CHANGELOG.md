# @claudiu-ceia/spatch

## 0.3.1

### Patch Changes

- 416d2ac: Optimize replacement rendering by compiling replacement templates once and reusing tokens across matches (including line-ending-specific variants), instead of re-tokenizing on every `renderTemplate` call.
- 9882dfc: Add `--check` mode for CI guardrails:

  - implies dry-run behavior
  - exits non-zero when replacements would be made
  - validates incompatible combination with `--interactive`

- 3196ad1: Fix rewrite matching for CRLF files by adapting patch pattern/replacement line endings per scanned file.
- e998d7e: Fix compact diff-style output line accounting so newline-terminated chunks render canonical hunk counts and no extra blank `+`/`-` lines.
- 7e0f163: Fix CLI help output to avoid boolean negation toggles (e.g. `--flag/--noFlag` and `--noNo-color`).
- 6b52c3a: Fix interactive apply to honor configured text encoding for file reads/writes, matching non-interactive behavior.
- ebcead5: Fix interactive mode option parity by forwarding `--concurrency` and `--verbose` behavior through the interactive rewrite pre-pass.
- c89bda1: Guard interactive apply against stale match offsets by validating selected occurrences against current file contents before writing any files.
- f9b36e2: Improve displayed file paths in patch results/output by falling back to scope-relative paths when `cwd`-relative paths would escape with long `../..` segments.
- a78522e: Refactor shared input parsing and spatch command validation internals:

  - add `parseTextInvocation` to `astkit-core` and reuse it in `spatch` + `sgrep` parse phases
  - validate invalid `spatch` flag combinations before resolving patch input
  - move spatch patch-document parser into phase-local module and keep root export as a compatibility shim

- a222ace: Use stricli for the standalone `spatch` CLI help and argument parsing.
- Updated dependencies [416d2ac]
- Updated dependencies [a78522e]
  - @claudiu-ceia/astkit-core@0.2.1

## 0.3.0

### Minor Changes

- 6cabe90: Support reading patch documents from stdin when patch input is `-`.

## 0.2.0

### Minor Changes

- 60a7865: Split astkit into workspaces and publish standalone `spatch`, `sgrep`, and `nav` packages alongside the `astkit` meta package.

### Patch Changes

- Updated dependencies [60a7865]
  - @claudiu-ceia/astkit-core@0.2.0
