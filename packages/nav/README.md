# @claudiu-ceia/nav

TypeScript language-service based navigation and reference tooling.

CLI:

```sh
npx @claudiu-ceia/nav --help
npx @claudiu-ceia/nav declarations <file>
npx @claudiu-ceia/nav definition <file>:<line>:<character>
npx @claudiu-ceia/nav references <file>:<line>:<character>
npx @claudiu-ceia/nav code-rank [scope]
```

Library:

```ts
import { getDeclarations, getDefinition, getReferences, rankCode } from "@claudiu-ceia/nav";
```

