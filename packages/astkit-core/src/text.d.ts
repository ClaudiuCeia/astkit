export declare function createLineStarts(text: string): number[];
export declare function toLineCharacter(lineStarts: readonly number[], index: number): {
    line: number;
    character: number;
};
