import type { ExponentialRetryPolicySpec } from "./retryPolicySpec.types";

export class ExpRetryPolicy implements ExponentialRetryPolicySpec {
  readonly kind = "exponential" as const;

  constructor(
    public readonly maxAttempts: number,
    public readonly initialDelayMs: number,
    public readonly multiplier: number,
    public readonly maxDelayMs?: number,
    public readonly jitter?: boolean,
  ) {
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || !Number.isInteger(maxAttempts)) {
      throw new Error(`ExpRetryPolicy.maxAttempts must be a positive integer, got ${maxAttempts}`);
    }
    if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
      throw new Error(`ExpRetryPolicy.initialDelayMs must be a non-negative finite number, got ${initialDelayMs}`);
    }
    if (!Number.isFinite(multiplier) || multiplier < 1) {
      throw new Error(`ExpRetryPolicy.multiplier must be >= 1, got ${multiplier}`);
    }
  }
}
