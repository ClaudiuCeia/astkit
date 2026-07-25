export let mutable = 1;
export var legacy = "legacy";

export declare function external(value: string): number;

export default async function load<T extends string>(value: T) {
  return { value };
}

export abstract class Base<T> {
  readonly count = 1;

  abstract parse(value: T): string;

  convert(value: string): string;
  convert(value: number): number;
  convert(value: string | number) {
    return value;
  }

  *items(value: T) {
    yield value;
  }

  get label() {
    return "base";
  }
}

export const enum Mode {
  Fast = "fast",
  Slow = "slow",
}

export function normalize(value: string): string;
export function normalize(value: number): number;
export function normalize(value: string | number) {
  return value;
}
