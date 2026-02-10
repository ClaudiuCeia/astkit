export type ResolveTextInputOptions = {
    cwd?: string;
    encoding?: BufferEncoding;
};
export declare function resolveTextInput(input: string, options?: ResolveTextInputOptions): Promise<string>;
