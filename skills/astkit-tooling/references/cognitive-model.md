# Repository Comprehension Model

Use this vocabulary when building repository summaries and implementation plans.

## System Boundaries and Entry Points

Capture:
- subsystem boundaries
- external interfaces
- entry points (HTTP handlers, queue consumers, CLI commands)

Prioritize purpose and responsibility over local implementation detail.

## Invariants and Contracts

Track rules that appear to remain stable across edits.
Examples:
- idempotency requirements
- authentication/authorization preconditions
- non-blocking or latency constraints
- schema or API compatibility contracts

Treat these as working hypotheses and re-check them after structural rewrites.

## Control Flow and Data Flow

Start from definitions and references, then inspect local implementation where needed.
Use navigation queries to map how symbols and values move across boundaries.
This gives a practical flow model, not whole-program path analysis.

## Change Hotspots and Dependency Hubs

Use recognized maintenance signals:
- change hotspots: areas with frequent edits and defect risk
- dependency hubs: symbols/modules with high fan-in or centrality
- blast radius: expected impact surface of a change

Use `code-rank` as an initial signal, then validate with local code inspection.

## Cognitive Load and Working Set

Treat active reasoning capacity as limited.
Keep in the working set:
- boundaries
- invariants
- flow skeleton
- top hotspots/hubs

Treat as recoverable on demand through tools:
- boilerplate
- generated code
- straightforward adapters
- low-signal implementation details

## Practical Heuristics

- Prefer design intent over mechanism detail.
- Track invariants and contracts, not full function bodies.
- Follow definition/reference links before deep local reading.
- Prioritize high-impact hotspots and dependency hubs.
- Defer low-signal code until required by a concrete task.
