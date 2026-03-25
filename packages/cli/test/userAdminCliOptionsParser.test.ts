import path from "node:path";
import process from "node:process";
import { expect, test } from "vitest";

import { UserAdminCliOptionsParser } from "../src/user/UserAdminCliOptionsParser";

test("returns undefined consumer root and config when flags omitted", () => {
  const parser = new UserAdminCliOptionsParser();
  expect(parser.parse({})).toEqual({ consumerRoot: undefined, configPath: undefined });
});

test("resolves consumer root relative to cwd when provided", () => {
  const parser = new UserAdminCliOptionsParser();
  const resolved = parser.parse({ consumerRoot: "sub" }).consumerRoot;
  expect(resolved).toBe(path.resolve(process.cwd(), "sub"));
});

test("trims and maps config to configPath", () => {
  const parser = new UserAdminCliOptionsParser();
  expect(parser.parse({ config: "  ./cfg.ts  " })).toEqual({
    consumerRoot: undefined,
    configPath: "./cfg.ts",
  });
});

test("ignores empty or whitespace-only consumer root and config", () => {
  const parser = new UserAdminCliOptionsParser();
  expect(parser.parse({ consumerRoot: "   ", config: "" })).toEqual({
    consumerRoot: undefined,
    configPath: undefined,
  });
});
