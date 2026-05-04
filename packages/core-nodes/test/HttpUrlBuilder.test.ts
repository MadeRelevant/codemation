import { HttpUrlBuilder } from "../src/http/HttpUrlBuilder";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

describe("HttpUrlBuilder", () => {
  const builder = new HttpUrlBuilder();

  test("returns base URL unchanged when no query provided", () => {
    const result = builder.build("https://api.example.com/users");
    assert.equal(result, "https://api.example.com/users");
  });

  test("returns base URL unchanged when query object is empty", () => {
    const result = builder.build("https://api.example.com/users", {});
    assert.equal(result, "https://api.example.com/users");
  });

  test("appends scalar query params", () => {
    const result = builder.build("https://api.example.com/search", { q: "hello", limit: "10" });
    const url = new URL(result);
    assert.equal(url.searchParams.get("q"), "hello");
    assert.equal(url.searchParams.get("limit"), "10");
  });

  test("appends array query params with repeated keys", () => {
    const result = builder.build("https://api.example.com/search", { tags: ["a", "b", "c"] });
    const url = new URL(result);
    assert.deepEqual(url.searchParams.getAll("tags"), ["a", "b", "c"]);
  });

  test("preserves existing query params on the URL", () => {
    const result = builder.build("https://api.example.com/search?existing=1", { added: "2" });
    const url = new URL(result);
    assert.equal(url.searchParams.get("existing"), "1");
    assert.equal(url.searchParams.get("added"), "2");
  });

  test("handles mixed scalar and array params", () => {
    const result = builder.build("https://api.example.com/items", {
      page: "1",
      ids: ["10", "20"],
    });
    const url = new URL(result);
    assert.equal(url.searchParams.get("page"), "1");
    assert.deepEqual(url.searchParams.getAll("ids"), ["10", "20"]);
  });
});
