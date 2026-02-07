# spatch

`spatch` applies structural rewrites using a patch document.

A patch document is a text block where:
- `-` lines define what to match
- `+` lines define what to insert
- other lines are context shared by both sides

You can pass the patch document either:
- inline as a string
- as a file path

## CLI

```bash
astkit patch <patch-input> [scope] [--cwd <path>] [--dry-run] [--json] [--no-color] [--interactive]
```

Examples:

```bash
# patch document from file
astkit patch rules/const-to-let.spatch src --cwd /repo

# inline patch document
astkit patch $'-const :[name] = :[value];\n+let :[name] = :[value];' src

# preview only
astkit patch rules/const-to-let.spatch src --dry-run

# structured JSON output
astkit patch rules/const-to-let.spatch src --json

# interactive apply mode
astkit patch rules/const-to-let.spatch src --interactive
```

## API

```ts
import { patchProject } from "astkit";

await patchProject(patchInput, {
  cwd: "/repo",       // optional, default process.cwd()
  scope: "src",       // file or directory, default "."
  dryRun: false,       // default false
  encoding: "utf8",   // default utf8
});
```

`patchInput` can be:
- a patch document string
- a path to a patch file (resolved from `cwd`)

## Patch Document Grammar

### Line kinds

- `-...`: deletion line (belongs to match pattern only)
- `+...`: addition line (belongs to replacement only)
- ` ...`: context line (belongs to both pattern and replacement)
- `\-...` and `\+...`: escaped marker lines, treated as literal context starting with `-` or `+`

### Minimum change rule

A patch document must contain at least one `-` line or one `+` line.

### Newline behavior

If the patch document ends with a trailing newline, both generated `pattern` and `replacement` preserve it.

## Metavariables

Inside pattern/replacement text, holes use this syntax:

- `:[name]`
- `:[_]` (anonymous hole, not captured)
- `:[name~regex]` (capture must satisfy regex)
- `...` (variadic wildcard; captured and reusable in replacement)

Examples:

```text
-const :[name] = :[value];
+let :[name] = :[value];
```

```text
-const :[name~[a-z]+] = :[value~\d+];
+let :[name] = Number(:[value]);
```

Repeated holes enforce equality:

```text
-:[x] + :[x];
+double(:[x]);
```

`foo + foo` matches, `foo + bar` does not.

Variadic example:

```text
-foo(:[x], ...);
+bar(:[x], ...);
```

Rewrites the callee and preserves remaining arguments.

## How It Works

### 1) Parse phase

`patchProject` resolves `patchInput` into a patch document and parses it into:
- `pattern`
- `replacement`

### 2) Rewrite phase

For each scoped file:
- compile template tokens from `pattern`
- find all structural matches
- render `replacement` with captures
- apply replacements
- optionally write file (skipped in `dryRun`)

### 3) Output phase

Return an aggregate result:
- files scanned/matched/changed
- match and replacement counts
- elapsed time
- per-file occurrences with spans and captures

## Structural Balancing

Hole captures are checked for structural balance to avoid malformed partial captures.

Balanced constructs supported in capture chunks:
- parentheses `(...)`
- brackets `[...]`
- braces `{...}`
- single/double/template strings
- line and block comments

## End-to-End Example

Patch document:

```text
function wrap() {
-  const value = :[value];
+  let value = :[value];
   return value;
}
```

Call:

```ts
await patchProject("rules/wrap.spatch", { cwd: "/repo", scope: "src" });
```

## Flow Diagram

```text
patchProject(patchInput, options)
  -> parsePatchInvocation
      -> resolve patch text (inline or file)
      -> parsePatchDocument (+/-/context)
  -> rewriteProject
      -> compileTemplate(pattern)
      -> collect files
      -> for each file: match -> render -> apply -> (write)
  -> buildSpatchResult
```
