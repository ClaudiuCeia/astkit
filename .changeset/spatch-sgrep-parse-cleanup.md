---
"@claudiu-ceia/astkit-core": patch
"@claudiu-ceia/spatch": patch
"@claudiu-ceia/sgrep": patch
---

Refactor shared input parsing and spatch command validation internals:

- add `parseTextInvocation` to `astkit-core` and reuse it in `spatch` + `sgrep` parse phases
- validate invalid `spatch` flag combinations before resolving patch input
- move spatch patch-document parser into phase-local module and keep root export as a compatibility shim
