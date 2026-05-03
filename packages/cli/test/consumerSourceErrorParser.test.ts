import { expect, test } from "vitest";

import { ConsumerSourceErrorParser } from "../src/dev/ConsumerSourceErrorParser";

test("parses a tsx-style stack with file:// protocol", () => {
  const error = new Error("SyntaxError: Unexpected token");
  error.stack = `Error: SyntaxError: Unexpected token
    at file:///home/x/wf.ts:12:5
    at Module._load (internal/modules/cjs/loader.js:456:58)`;

  const parser = new ConsumerSourceErrorParser();
  const result = parser.parse(error);

  expect(result).toEqual({
    message: "SyntaxError: Unexpected token",
    file: "/home/x/wf.ts",
    line: 12,
    column: 5,
  });
});

test("parses a Node-style stack without file:// protocol", () => {
  const error = new Error("TypeError: x is not a function");
  error.stack = `TypeError: x is not a function
    at fn (/home/x/wf.ts:42:11)
    at Module._load (internal/modules/cjs/loader.js:456:58)`;

  const parser = new ConsumerSourceErrorParser();
  const result = parser.parse(error);

  expect(result).toEqual({
    message: "TypeError: x is not a function",
    file: "/home/x/wf.ts",
    line: 42,
    column: 11,
  });
});

test("falls back to message only when stack has no file location", () => {
  const error = new Error("Something went wrong");
  error.stack = `Error: Something went wrong
    at unknown location`;

  const parser = new ConsumerSourceErrorParser();
  const result = parser.parse(error);

  expect(result).toEqual({
    message: "Something went wrong",
  });
});
