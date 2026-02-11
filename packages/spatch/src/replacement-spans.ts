type ReplacementSpan = {
  start: number;
  end: number;
  replacement: string;
};

export function applyReplacementSpans(source: string, spans: readonly ReplacementSpan[]): string {
  if (spans.length === 0) {
    return source;
  }

  const ordered = [...spans].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return left.end - right.end;
  });

  const parts: string[] = [];
  let cursor = 0;

  for (const span of ordered) {
    if (span.start < 0 || span.end < span.start || span.end > source.length) {
      throw new Error("Invalid replacement spans: out-of-bounds span.");
    }
    if (span.start < cursor) {
      throw new Error("Invalid replacement spans: overlapping spans.");
    }

    parts.push(source.slice(cursor, span.start));
    parts.push(span.replacement);
    cursor = span.end;
  }

  parts.push(source.slice(cursor));
  return parts.join("");
}
