import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  compileTemplate,
  ELLIPSIS_CAPTURE_PREFIX,
  findTemplateMatches,
} from "../../pattern/index.ts";
import { collectPatchableFiles } from "../../spatch/files.ts";
import { createLineStarts, toLineCharacter } from "../../spatch/text.ts";
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
  const compiledPattern = compileTemplate(search.pattern);
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
      compiledPattern,
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
  compiledPattern: ReturnType<typeof compileTemplate>;
  encoding: BufferEncoding;
};

async function searchFile(
  input: SearchFileInput,
): Promise<SgrepFileResult | null> {
  const sourceText = await readFile(input.filePath, input.encoding);
  const matches = findTemplateMatches(sourceText, input.compiledPattern);
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
