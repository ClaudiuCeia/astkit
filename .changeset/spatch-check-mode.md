---
"@claudiu-ceia/spatch": patch
---

Add `--check` mode for CI guardrails:

- implies dry-run behavior
- exits non-zero when replacements would be made
- validates incompatible combination with `--interactive`
