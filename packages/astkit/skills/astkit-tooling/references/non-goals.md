# Non-Goals

`astkit` is not designed to:

- infer developer intent from naming or style alone
- model full runtime behavior across dynamic dispatch and I/O
- guarantee that structural rewrites preserve behavior
- replace compiler diagnostics, linters, or test suites
- decide whether a refactor should be applied without human review
- rank runtime criticality from references alone
- treat missing matches as proof that a pattern is absent
