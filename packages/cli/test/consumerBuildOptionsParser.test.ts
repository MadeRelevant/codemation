import assert from "node:assert/strict";
import { test } from "vitest";

import { ConsumerBuildOptionsParser } from "../src/build/ConsumerBuildOptionsParser";

test("parse applies defaults when no flags", () => {
  const parser = new ConsumerBuildOptionsParser();
  const options = parser.parse({});
  assert.equal(options.sourceMaps, true);
  assert.equal(options.target, "es2022");
});

test("parse disables source maps when noSourceMaps is true", () => {
  const parser = new ConsumerBuildOptionsParser();
  const options = parser.parse({ noSourceMaps: true });
  assert.equal(options.sourceMaps, false);
});

test("parse accepts es2020 target", () => {
  const parser = new ConsumerBuildOptionsParser();
  const options = parser.parse({ target: "es2020" });
  assert.equal(options.target, "es2020");
  assert.equal(options.sourceMaps, true);
});

test("parse rejects invalid target", () => {
  const parser = new ConsumerBuildOptionsParser();
  assert.throws(() => parser.parse({ target: "es2015" }), /Invalid --target/);
});
