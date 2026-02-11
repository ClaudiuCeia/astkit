import type { SpatchOccurrence } from "../../types.ts";

export function validateSelectedOccurrences(
  file: string,
  source: string,
  occurrences: readonly SpatchOccurrence[],
): void {
  const sorted = [...occurrences].sort((left, right) => left.start - right.start);
  let cursor = 0;

  for (const occurrence of sorted) {
    if (
      occurrence.start < 0 ||
      occurrence.end < occurrence.start ||
      occurrence.end > source.length
    ) {
      throw new Error(
        `File changed during interactive patch selection: ${file}. Re-run spatch interactive to refresh match positions.`,
      );
    }
    if (occurrence.start < cursor) {
      throw new Error(
        `Invalid overlapping interactive occurrences for ${file}. Re-run spatch interactive.`,
      );
    }

    const currentMatched = source.slice(occurrence.start, occurrence.end);
    if (currentMatched !== occurrence.matched) {
      throw new Error(
        `File changed during interactive patch selection: ${file}. Re-run spatch interactive to refresh match positions.`,
      );
    }

    cursor = occurrence.end;
  }
}
