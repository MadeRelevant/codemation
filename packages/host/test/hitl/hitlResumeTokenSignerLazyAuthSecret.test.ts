import { describe, expect, test } from "vitest";
import { HitlResumeTokenSigner } from "../../src/hitl/HitlResumeTokenSigner";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

/**
 * Constructor no longer throws when AUTH_SECRET is missing — the throw is
 * deferred to sign()/verify() time. This lets the wider DI graph resolve in
 * test/CI environments that don't set AUTH_SECRET while still failing loudly
 * for any real HITL code path that tries to sign or verify a token.
 *
 * Regression: HITL sprint shipped a constructor-time throw, which broke every
 * coverage suite (Integration / UI / Browser / e2e / Integration sqlite) on
 * PR #167 because the engine bootstrap reaches HitlResumeTokenSigner via the
 * telemetry/workflow-definition repository chain even in non-HITL test paths.
 */
describe("HitlResumeTokenSigner — lazy AUTH_SECRET requirement", () => {
  function appConfig(env: NodeJS.ProcessEnv): AppConfig {
    return { env } as unknown as AppConfig;
  }

  test("constructs successfully without AUTH_SECRET set", () => {
    const signer = new HitlResumeTokenSigner(appConfig({}));
    expect(signer).toBeInstanceOf(HitlResumeTokenSigner);
  });

  test("sign() throws when AUTH_SECRET is missing", () => {
    const signer = new HitlResumeTokenSigner(appConfig({}));
    expect(() =>
      signer.sign({
        taskId: "task-1",
        expiresAt: new Date("2030-01-01T00:01:00Z"),
        schemaHash: "abcdef12345678",
      }),
    ).toThrowError(/AUTH_SECRET is required/);
  });

  test("verify() throws when AUTH_SECRET is missing", () => {
    const signer = new HitlResumeTokenSigner(appConfig({}));
    expect(() => signer.verify("a.1.b.c")).toThrowError(/AUTH_SECRET is required/);
  });

  test("sign() works when AUTH_SECRET is set", () => {
    const signer = new HitlResumeTokenSigner(appConfig({ AUTH_SECRET: "test-secret-42chars-or-longer-for-hmac-key" }));
    const token = signer.sign({
      taskId: "task-1",
      expiresAt: new Date("2030-01-01T00:01:00Z"),
      schemaHash: "abcdef12",
    });
    expect(token.split(".").length).toBe(4);
  });
});
