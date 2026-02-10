import type ts from "typescript";
export type IsomorphismContext = {
    source: string;
    ast: ts.SourceFile;
};
export type IsomorphismRule = {
    id: string;
    description: string;
    apply: (context: IsomorphismContext) => string[];
};
export type ExpandIsomorphismsOptions = {
    enabled?: boolean;
    maxVariants?: number;
    rules?: readonly IsomorphismRule[];
};
