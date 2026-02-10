export function createLineStarts(text) {
    const starts = [0];
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "\n") {
            starts.push(index + 1);
        }
    }
    return starts;
}
export function toLineCharacter(lineStarts, index) {
    if (lineStarts.length === 0) {
        return { line: 1, character: Math.max(index + 1, 1) };
    }
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const start = lineStarts[middle] ?? 0;
        const nextStart = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
        if (start <= index && index < nextStart) {
            return { line: middle + 1, character: index - start + 1 };
        }
        if (index < start) {
            high = middle - 1;
            continue;
        }
        low = middle + 1;
    }
    const fallback = lineStarts[lineStarts.length - 1] ?? 0;
    const line = Math.max(lineStarts.length, 1);
    return {
        line,
        character: Math.max(index - fallback + 1, 1),
    };
}
