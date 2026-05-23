import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { DevModeResolver } from "../src/dev/DevModeResolver";

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.CODEMATION_DEV_MODE;
  delete process.env.CODEMATION_DEV_MODE;
});

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.CODEMATION_DEV_MODE;
  } else {
    process.env.CODEMATION_DEV_MODE = savedEnv;
  }
});

test("DevModeResolver defaults to packaged-ui", () => {
  assert.equal(new DevModeResolver().resolve({}), "packaged-ui");
});

test("DevModeResolver returns api-only when apiOnly flag is set", () => {
  assert.equal(new DevModeResolver().resolve({ apiOnly: true }), "api-only");
});

test("DevModeResolver returns api-only from CODEMATION_DEV_MODE env var", () => {
  process.env.CODEMATION_DEV_MODE = "api-only";
  assert.equal(new DevModeResolver().resolve({}), "api-only");
});

test("DevModeResolver returns watch-framework when watchFramework flag is set", () => {
  assert.equal(new DevModeResolver().resolve({ watchFramework: true }), "watch-framework");
});

test("DevModeResolver returns watch-framework from CODEMATION_DEV_MODE=framework env var", () => {
  process.env.CODEMATION_DEV_MODE = "framework";
  assert.equal(new DevModeResolver().resolve({}), "watch-framework");
});

test("DevModeResolver apiOnly flag takes priority over watchFramework flag", () => {
  assert.equal(new DevModeResolver().resolve({ apiOnly: true, watchFramework: true }), "api-only");
});

test("DevModeResolver CODEMATION_DEV_MODE=api-only takes priority over watchFramework flag", () => {
  process.env.CODEMATION_DEV_MODE = "api-only";
  assert.equal(new DevModeResolver().resolve({ watchFramework: true }), "api-only");
});
