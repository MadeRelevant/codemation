import assert from "node:assert/strict";
import { test } from "vitest";
import { ItemsInputNormalizer } from "../src/index.ts";

test("items input normalizer wraps a single json object as one item", () => {
  const normalizer = new ItemsInputNormalizer();

  assert.deepEqual(normalizer.normalize({ changed: true }), [{ json: { changed: true } }]);
});

test("items input normalizer wraps arrays of json objects as items", () => {
  const normalizer = new ItemsInputNormalizer();

  assert.deepEqual(normalizer.normalize([{ first: true }, { second: true }]), [
    { json: { first: true } },
    { json: { second: true } },
  ]);
});

test("items input normalizer preserves already wrapped items", () => {
  const normalizer = new ItemsInputNormalizer();

  assert.deepEqual(normalizer.normalize({ json: { wrapped: "single" } }), [{ json: { wrapped: "single" } }]);
  assert.deepEqual(
    normalizer.normalize([
      {
        json: { wrapped: true },
        meta: { source: "test" },
      },
    ]),
    [
      {
        json: { wrapped: true },
        meta: { source: "test" },
      },
    ],
  );
});

test("items input normalizer wraps primitive values as item json", () => {
  const normalizer = new ItemsInputNormalizer();

  assert.deepEqual(normalizer.normalize("value"), [{ json: "value" }]);
});

test("items input normalizer returns an empty array for nullish input", () => {
  const normalizer = new ItemsInputNormalizer();

  assert.deepEqual(normalizer.normalize(undefined), []);
  assert.deepEqual(normalizer.normalize(null), []);
});
