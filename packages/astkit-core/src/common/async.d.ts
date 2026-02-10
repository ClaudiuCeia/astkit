export type MapLimitOptions = {
    concurrency: number;
};
export declare function mapLimit<T, R>(items: readonly T[], mapper: (item: T, index: number) => Promise<R>, options: MapLimitOptions): Promise<R[]>;
