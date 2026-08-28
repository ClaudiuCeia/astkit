/** Parse a named value. */
export function parse(value: string): string;
export function parse(value: number): number;
export function parse(value: string | number) {
  return value;
}
