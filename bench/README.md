# Benchmarks

This repo uses `mitata` for benchmarking.

## Run

```sh
bun run bench
```

## Regression check (optional)

Benchmarks are noisy across machines. The regression check compares against a local baseline file.

```sh
# record / update a baseline on *this* machine
bun run bench:baseline

# fail (exit 1) if any benchmark regresses beyond tolerance (default 20%)
bun run bench:check
```

If you don't have a baseline yet:

```sh
bun run bench:check -- --init
```

You can tune tolerance:

```sh
bun run bench:check -- --tolerance 0.15
```
