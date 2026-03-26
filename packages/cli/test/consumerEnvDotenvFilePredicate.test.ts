import path from "node:path";

import { describe, expect, it } from "vitest";

import { ConsumerEnvDotenvFilePredicate } from "../src/dev/ConsumerEnvDotenvFilePredicate";

describe("ConsumerEnvDotenvFilePredicate", () => {
  const predicate = new ConsumerEnvDotenvFilePredicate();

  it("matches .env and .env.* at any depth", () => {
    expect(predicate.matches(path.join("/app", ".env"))).toBe(true);
    expect(predicate.matches(path.join("/app", ".env.local"))).toBe(true);
    expect(predicate.matches(path.join("/app", "src", ".env.development"))).toBe(true);
  });

  it("does not match unrelated filenames", () => {
    expect(predicate.matches(path.join("/app", "env.ts"))).toBe(false);
    expect(predicate.matches(path.join("/app", "dotenv"))).toBe(false);
    expect(predicate.matches(path.join("/app", ".environment"))).toBe(false);
  });
});
