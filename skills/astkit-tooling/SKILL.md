---
name: astkit-tooling
description: Use when a TypeScript/JavaScript task needs symbol navigation (`nav declarations|definition|references`), structural pattern search (`search`), structural rewrites (`patch`), or reference-based blast-radius estimation (`code-rank`). Prefer for compact, scoped repository analysis and migration work; do not use for runtime-path proofs, correctness guarantees, or replacing compiler/tests.
---

# astkit tooling

Use `astkit` for token-efficient repository exploration and structural edits in TS/JS projects.
Keep scope narrow first, expand only when evidence is insufficient.

## Quick Start

1. Confirm tool availability.
- `astkit --help`
- or `npx astkit --help`
- or `bunx astkit --help`

2. Start with one focused operation.
- `astkit nav declarations <file>`
- `astkit nav definition <file:line:character>`
- `astkit nav references <file:line:character>`
- `astkit search '<pattern>' <scope> --json`
- `astkit patch --dry-run '<patch-document>' <scope>`
- `astkit code-rank <scope> --limit 25 --json`

3. Expand scope only if needed.

## Working Workflow

1. Map contracts before implementation details.
- Use `nav declarations` and `nav definition` first.
- Treat signatures/docs as intended contracts until contradicted by evidence.

2. Clarify behavior from usage.
- Use `nav references` to inspect representative callsites.
- Prefer usage patterns over deep source reading for initial understanding.

3. Estimate blast radius before edits.
- Use `code-rank` and references to identify high-impact symbols.
- Prefer localized changes when task scope is localized.

4. Rewrite with structural tools.
- Use `search` to find candidate shapes.
- Use `patch --dry-run` before writing changes.
- Use `patch --interactive` for high-risk or broad rewrites.

5. Re-check and validate.
- Re-run focused `search`/`nav references` on touched symbols.
- Validate with `tsc` and relevant tests when available.

## Safe Rewrite Workflow

1. Find candidate sites.
- `astkit search '<pattern>' <scope> --json`

2. Preview rewrite.
- `astkit patch --dry-run '<patch-document>' <scope>`

3. Apply rewrite.
- `astkit patch '<patch-document>' <scope>`
- Use `--interactive` for high-risk or broad edits.

4. Re-check surfaced contracts.
- Re-run focused `search` queries and `nav references` on touched symbols.

5. Validate with compiler and tests.
- Run `tsc` diagnostics.
- Run focused tests for touched behavior.

## Reporting Contract

When reporting findings, include:

- system boundaries and entry points
- invariants/contracts with explicit status (`observed` vs `inferred`)
- definition/reference flow summary
- change hotspots/dependency hubs
- suggested edits with blast-radius notes
- validation status and remaining gaps

Keep output concise and include file paths/spans where possible.

## Guardrails

- Structural similarity does not imply behavioral equivalence.
- Structural rewrites reduce accidental matches but do not guarantee correctness.
- Reference ranking approximates impact, not runtime criticality.
- No matches do not prove absence of behavior.
- Do not use this skill as a substitute for compiler diagnostics or tests.

## Common Failure Modes

- Too many matches: narrow scope, add delimiters, add regex constraints.
- No matches: verify pattern shape, scope, and `--no-isomorphisms` usage.
- Rewrite too broad: switch to `--interactive` and re-run dry-run first.
- Unclear impact: inspect `nav references` and `code-rank` before applying.

## References

- `./references/cognitive-model.md`
- `./references/non-goals.md`
