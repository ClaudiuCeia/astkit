---
"@claudiu-ceia/spatch": patch
---

Improve displayed file paths in patch results/output by falling back to scope-relative paths when `cwd`-relative paths would escape with long `../..` segments.
