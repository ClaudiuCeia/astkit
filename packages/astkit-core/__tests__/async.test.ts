import { expect, test } from "bun:test";

import { mapLimit } from "../src/common/async.ts";

test("mapLimit preserves falsy rejection reasons", async () => {
  let rejected = false;

  try {
    await mapLimit([1, 2], async () => Promise.reject(undefined), { concurrency: 2 });
  } catch (error) {
    rejected = true;
    expect(error).toBeUndefined();
  }

  expect(rejected).toBe(true);
});

test("mapLimit rejects invalid concurrency", async () => {
  for (const concurrency of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(mapLimit([1], async (value) => value, { concurrency })).rejects.toThrow(
      "concurrency must be a positive finite number",
    );
  }
});
