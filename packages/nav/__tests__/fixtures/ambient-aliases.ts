declare function parse(value: string): string;
declare function parse(value: number): number;
declare function parseNamed(value: boolean): boolean;

export { parse as default };
export { parseNamed as ambientParse };
