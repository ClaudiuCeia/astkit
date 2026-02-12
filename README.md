# astkit

Monorepo for `astkit` tooling: structural search, structural rewrite, and TypeScript navigation utilities for TS/JS codebases.

## Package map

- `@claudiu-ceia/astkit`: umbrella CLI and meta package re-exporting public APIs
- `@claudiu-ceia/sgrep`: structural search with metavariables and isomorphisms
- `@claudiu-ceia/spatch`: structural rewrite engine using patch documents
- `@claudiu-ceia/nav`: declarations, definition, references, and code-rank via TS language service
- `@claudiu-ceia/astkit-core`: shared internals used by the packages above

## Which README to read

- Umbrella package usage: `packages/astkit/README.md`
- Search details (`sgrep` syntax, isomorphisms, API): `packages/sgrep/README.md`
- Patch details (`spatch` document format, safety, API): `packages/spatch/README.md`
- Navigation details (`nav` commands and API): `packages/nav/README.md`

This root README stays repo-focused to avoid duplicating CLI docs across package READMEs.

## Install

Install the umbrella package for one entrypoint:

```bash
npm install --save-dev @claudiu-ceia/astkit typescript
```

Or install individual tools:

```bash
npm install --save-dev @claudiu-ceia/sgrep
npm install --save-dev @claudiu-ceia/spatch
npm install --save-dev @claudiu-ceia/nav typescript
```

## Monorepo development

```bash
bun install
bun run astkit -- --help
bun run sgrep -- --help
bun run spatch -- --help
bun run nav -- --help
```

## Quality gates

```bash
bun run format:check
bun run typecheck
bun run build
bun run test
bun run test:coverage
bun run knip
```

## Release flow

```bash
bun run changeset
bun run version-packages
bun run release
bun run pack:check
```

## Skill integration

```bash
bun run skill:install
```

## Repository layout

- `packages/astkit/src/*`: umbrella CLI app and meta re-exports
- `packages/sgrep/src/*`: search pipeline (`parse -> search -> output`)
- `packages/spatch/src/*`: patch pipeline (`parse -> rewrite -> output`)
- `packages/nav/src/*`: TS language-service navigation and ranking commands
- `packages/astkit-core/src/*`: shared matching, parsing, and filesystem utilities
- `bench/*`: benchmark suites
