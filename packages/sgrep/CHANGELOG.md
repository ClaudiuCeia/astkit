# @claudiu-ceia/sgrep

## 0.3.0

### Minor Changes

- 278edf1: Require Node.js 22.12 or newer and update runtime dependencies to their current supported releases.
- 0369d33: Harden structural matching, replacement validation, navigation inputs, barrel declarations, and atomic patch writes.

  Make default isomorphisms semantics-preserving, export public API result types, and prune impossible matcher branches for substantially better adversarial performance.

### Patch Changes

- Updated dependencies [278edf1]
- Updated dependencies [0369d33]
  - @claudiu-ceia/astkit-core@0.3.0

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
