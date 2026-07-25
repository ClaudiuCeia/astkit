# @claudiu-ceia/astkit

## 0.2.0

### Minor Changes

- 278edf1: Require Node.js 22.12 or newer and update runtime dependencies to their current supported releases.
- 0369d33: Harden structural matching, replacement validation, navigation inputs, barrel declarations, and atomic patch writes.

  Make default isomorphisms semantics-preserving, export public API result types, and prune impossible matcher branches for substantially better adversarial performance.

### Patch Changes

- Updated dependencies [278edf1]
- Updated dependencies [0369d33]
  - @claudiu-ceia/nav@0.3.0
  - @claudiu-ceia/sgrep@0.3.0
  - @claudiu-ceia/spatch@0.4.0

## 0.1.3

### Patch Changes

- Updated dependencies [6cabe90]
  - @claudiu-ceia/spatch@0.3.0

## 0.1.2

### Patch Changes

- 60a7865: Split astkit into workspaces and publish standalone `spatch`, `sgrep`, and `nav` packages alongside the `astkit` meta package.
- Updated dependencies [60a7865]
  - @claudiu-ceia/spatch@0.2.0
  - @claudiu-ceia/sgrep@0.2.0
  - @claudiu-ceia/nav@0.2.0
