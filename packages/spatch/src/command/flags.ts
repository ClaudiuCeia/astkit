export type PatchCommandFlags = {
  "dry-run"?: boolean;
  interactive?: boolean;
  json?: boolean;
  "no-color"?: boolean;
  cwd?: string;
  concurrency?: number;
  verbose?: number;
};

export const patchCommandFlagParameters = {
  concurrency: {
    kind: "parsed" as const,
    optional: true,
    brief: "Max files processed concurrently (default: 8)",
    placeholder: "n",
    parse: (input: string) => {
      const value = Number(input);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--concurrency must be a positive number");
      }
      return Math.floor(value);
    },
  },
  verbose: {
    kind: "parsed" as const,
    optional: true,
    brief: "Print perf tracing (1=summary, 2=includes slow files)",
    placeholder: "level",
    parse: (input: string) => {
      const value = Number(input);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--verbose must be a non-negative number");
      }
      return Math.floor(value);
    },
  },
  interactive: {
    kind: "boolean" as const,
    optional: true,
    withNegated: false,
    brief: "Interactively select which matches to apply",
  },
  json: {
    kind: "boolean" as const,
    optional: true,
    withNegated: false,
    brief: "Output structured JSON instead of compact diff-style text",
  },
  "no-color": {
    kind: "boolean" as const,
    optional: true,
    withNegated: false,
    brief: "Disable colored output",
  },
  "dry-run": {
    kind: "boolean" as const,
    optional: true,
    withNegated: false,
    brief: "Preview changes without writing files",
  },
  cwd: {
    kind: "parsed" as const,
    optional: true,
    brief: "Working directory for resolving patch file and scope",
    placeholder: "path",
    parse: (input: string) => input,
  },
} as const;

export function validatePatchCommandFlags(flags: PatchCommandFlags): void {
  if ((flags.interactive ?? false) && (flags["dry-run"] ?? false)) {
    throw new Error("Cannot combine --interactive with --dry-run.");
  }
}
