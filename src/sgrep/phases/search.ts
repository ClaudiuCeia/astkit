import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  compileTemplate,
  ELLIPSIS_CAPTURE_PREFIX,
  findTemplateMatches,
  type TemplateMatch,
} from "../../pattern/index.ts";
import { collectPatchableFiles } from "../../spatch/files.ts";
import { createLineStarts, toLineCharacter } from "../../spatch/text.ts";
import { expandPatternIsomorphisms } from "../isomorphisms/index.ts";
import type { SgrepFileResult, SgrepOptions } from "../types.ts";
import type { ParsedSearchSpec } from "./parse.ts";

export type SearchPhaseResult = {
  cwd: string;
  scope: string;
  filesScanned: number;
  filesMatched: number;
  totalMatches: number;
  files: SgrepFileResult[];
};

export async function searchProjectFiles(
  search: ParsedSearchSpec,
  options: SgrepOptions,
): Promise<SearchPhaseResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? ".";
  const encoding = options.encoding ?? "utf8";
  const resolvedScope = path.resolve(cwd, scope);
  const compiledPatterns = compileSearchPatterns(
    search.pattern,
    options.isomorphisms ?? true,
  );
  const files = await collectPatchableFiles({
    cwd,
    scope,
    extensions: options.extensions,
    excludedDirectories: options.excludedDirectories,
  });

  let filesMatched = 0;
  let totalMatches = 0;
  const fileResults: SgrepFileResult[] = [];

  for (const filePath of files) {
    const fileResult = await searchFile({
      cwd,
      filePath,
      compiledPatterns,
      encoding,
    });

    if (!fileResult) {
      continue;
    }

    filesMatched += 1;
    totalMatches += fileResult.matchCount;
    fileResults.push(fileResult);
  }

  return {
    cwd,
    scope: resolvedScope,
    filesScanned: files.length,
    filesMatched,
    totalMatches,
    files: fileResults,
  };
}

type SearchFileInput = {
  cwd: string;
  filePath: string;
  compiledPatterns: ReturnType<typeof compileTemplate>[];
  encoding: BufferEncoding;
};

async function searchFile(
  input: SearchFileInput,
): Promise<SgrepFileResult | null> {
  const sourceText = await readFile(input.filePath, input.encoding);
  const matches = findFileMatches(sourceText, input.compiledPatterns);
  if (matches.length === 0) {
    return null;
  }

  const lineStarts = createLineStarts(sourceText);
  const searchMatches = matches.map((match) => {
    const { line, character } = toLineCharacter(lineStarts, match.start);
    return {
      start: match.start,
      end: match.end,
      line,
      character,
      matched: match.text,
      captures: filterPublicCaptures(match.captures),
    };
  });

  return {
    file: path.relative(input.cwd, input.filePath) || path.basename(input.filePath),
    matchCount: matches.length,
    matches: searchMatches,
  };
}

function filterPublicCaptures(
  captures: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(captures).filter(
    ([name]) => !name.startsWith(ELLIPSIS_CAPTURE_PREFIX),
  );
  return Object.fromEntries(entries);
}

function compileSearchPatterns(
  pattern: string,
  withIsomorphisms: boolean,
): ReturnType<typeof compileTemplate>[] {
  const variants = expandPatternIsomorphisms(pattern, {
    enabled: withIsomorphisms,
  });
  const compiledPatterns: ReturnType<typeof compileTemplate>[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    if (!variant || seen.has(variant)) {
      continue;
    }
    seen.add(variant);

    try {
      compiledPatterns.push(compileTemplate(variant));
    } catch (error) {
      if (variant === pattern || index === 0) {
        throw error;
      }
    }
  }

  if (compiledPatterns.length === 0) {
    throw new Error("Unable to compile search pattern.");
  }

  return compiledPatterns;
}

function findFileMatches(
  sourceText: string,
  compiledPatterns: readonly ReturnType<typeof compileTemplate>[],
): TemplateMatch[] {
  const uniqueBySpan = new Map<string, TemplateMatch>();

  for (const compiledPattern of compiledPatterns) {
    const matches = findTemplateMatches(sourceText, compiledPattern);
    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      if (!uniqueBySpan.has(key)) {
        uniqueBySpan.set(key, match);
      }
    }
  }

  return [...uniqueBySpan.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}
