export type FilePosition = {
    file: string;
    line: number;
    character: number;
};
export declare function parseFilePosition(input: string): FilePosition;
