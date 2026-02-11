# @claudiu-ceia/sgrep

## 0.2.1

### Patch Changes

- a78522e: Refactor shared input parsing and spatch command validation internals:

  - add `parseTextInvocation` to `astkit-core` and reuse it in `spatch` + `sgrep` parse phases
  - validate invalid `spatch` flag combinations before resolving patch input
  - move spatch patch-document parser into phase-local module and keep root export as a compatibility shim

- Updated dependencies [416d2ac]
- Updated dependencies [a78522e]
  - @claudiu-ceia/astkit-core@0.2.1

## 0.2.0

### Minor Changes

- 60a7865: Split astkit into workspaces and publish standalone `spatch`, `sgrep`, and `nav` packages alongside the `astkit` meta package.

### Patch Changes

- Updated dependencies [60a7865]
  - @claudiu-ceia/astkit-core@0.2.0
