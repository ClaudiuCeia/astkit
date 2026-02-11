---
"@claudiu-ceia/astkit-core": patch
"@claudiu-ceia/spatch": patch
---

Optimize replacement rendering by compiling replacement templates once and reusing tokens across matches (including line-ending-specific variants), instead of re-tokenizing on every `renderTemplate` call.
