# @claudiu-ceia/astkit-core

## 0.2.1

### Patch Changes

- 416d2ac: Optimize replacement rendering by compiling replacement templates once and reusing tokens across matches (including line-ending-specific variants), instead of re-tokenizing on every `renderTemplate` call.
- a78522e: Refactor shared input parsing and spatch command validation internals:

  - add `parseTextInvocation` to `astkit-core` and reuse it in `spatch` + `sgrep` parse phases
  - validate invalid `spatch` flag combinations before resolving patch input
  - move spatch patch-document parser into phase-local module and keep root export as a compatibility shim

## 0.2.0

### Minor Changes

- 60a7865: Split astkit into workspaces and publish standalone `spatch`, `sgrep`, and `nav` packages alongside the `astkit` meta package.
