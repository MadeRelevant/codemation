import type { FixedRetryPolicySpec } from "./retryPolicySpec.types";

export class RetryPolicy implements FixedRetryPolicySpec {
  readonly kind = "fixed" as const;

  constructor(
    public readonly maxAttempts: number,
    public readonly delayMs: number,
  ) {
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || !Number.isInteger(maxAttempts)) {
      throw new Error(`RetryPolicy.maxAttempts must be a positive integer, got ${maxAttempts}`);
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error(`RetryPolicy.delayMs must be a non-negative finite number, got ${delayMs}`);
    }
  }

  /** Default for HTTP-style transient failures: 3 tries, 1s between attempts. */
  static readonly defaultForHttp: FixedRetryPolicySpec = { kind: "fixed", maxAttempts: 3, delayMs: 1000 };

  /** Default for LLM / agent calls: 3 tries, 2s fixed backoff. */
  static readonly defaultForAiAgent: FixedRetryPolicySpec = { kind: "fixed", maxAttempts: 3, delayMs: 2000 };
}
