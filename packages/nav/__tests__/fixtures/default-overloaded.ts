/** Parse a default value. */
export default function parseDefault(value: string): string;
export default function parseDefault(value: number): number;
export default function parseDefault(value: string | number) {
  return value;
}
