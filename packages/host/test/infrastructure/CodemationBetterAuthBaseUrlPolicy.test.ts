import assert from "node:assert/strict";
import { test } from "vitest";

import type { Logger } from "../../src/application/logging/Logger";
import { CodemationBetterAuthBaseUrlPolicy } from "../../src/infrastructure/auth/CodemationBetterAuthBaseUrlPolicy";

class CapturingLogger implements Logger {
  readonly warnings: string[] = [];

  info(): void {}
  warn(message: string): void {
    this.warnings.push(message);
  }
  error(): void {}
  debug(): void {}
}

test("CodemationBetterAuthBaseUrlPolicy prefers BETTER_AUTH_URL over CODEMATION_PUBLIC_BASE_URL", () => {
  const logger = new CapturingLogger();
  const policy = new CodemationBetterAuthBaseUrlPolicy(logger);
  const origin = policy.resolveOriginFromEnv({
    BETTER_AUTH_URL: "https://auth.example.com/path",
    CODEMATION_PUBLIC_BASE_URL: "https://app.example.com",
    NODE_ENV: "test",
  });
  assert.equal(origin, "https://auth.example.com");
});

test("CodemationBetterAuthBaseUrlPolicy falls back to CODEMATION_PUBLIC_BASE_URL", () => {
  const logger = new CapturingLogger();
  const policy = new CodemationBetterAuthBaseUrlPolicy(logger);
  const origin = policy.resolveOriginFromEnv({
    CODEMATION_PUBLIC_BASE_URL: "http://127.0.0.1:3000",
    NODE_ENV: "test",
  });
  assert.equal(origin, "http://127.0.0.1:3000");
});

test("CodemationBetterAuthBaseUrlPolicy warns when origins disagree", () => {
  const logger = new CapturingLogger();
  const policy = new CodemationBetterAuthBaseUrlPolicy(logger);
  policy.resolveOriginFromEnv({
    BETTER_AUTH_URL: "https://a.example.com",
    CODEMATION_PUBLIC_BASE_URL: "https://b.example.com",
    NODE_ENV: "test",
  });
  assert.equal(logger.warnings.length, 1);
  assert.ok(logger.warnings[0]?.includes("differs from"));
});

test("CodemationBetterAuthBaseUrlPolicy warns in production when no valid origin is configured", () => {
  const logger = new CapturingLogger();
  const policy = new CodemationBetterAuthBaseUrlPolicy(logger);
  const origin = policy.resolveOriginFromEnv({ NODE_ENV: "production" });
  assert.equal(origin, undefined);
  assert.equal(logger.warnings.length, 1);
  assert.ok(logger.warnings[0]?.includes("production"));
});

test("CodemationBetterAuthBaseUrlPolicy warns on invalid BETTER_AUTH_URL", () => {
  const logger = new CapturingLogger();
  const policy = new CodemationBetterAuthBaseUrlPolicy(logger);
  const origin = policy.resolveOriginFromEnv({
    BETTER_AUTH_URL: ":::not-a-url",
    CODEMATION_PUBLIC_BASE_URL: "http://127.0.0.1:4000",
    NODE_ENV: "test",
  });
  assert.equal(origin, "http://127.0.0.1:4000");
  assert.ok(logger.warnings.some((w) => w.includes("BETTER_AUTH_URL")));
});
