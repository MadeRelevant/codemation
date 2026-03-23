/**
 * In-process retry policy for runnable nodes. Serialized configs use the same
 * `kind` discriminator (`JSON.stringify` / persisted workflows).
 *
 * `maxAttempts` is the total number of tries including the first (e.g. 3 means up to 2 delays after failures).
 */

export type RetryPolicySpec = NoneRetryPolicySpec | FixedRetryPolicySpec | ExponentialRetryPolicySpec;

export interface NoneRetryPolicySpec {
  readonly kind: "none";
}

export interface FixedRetryPolicySpec {
  readonly kind: "fixed";
  /** Total attempts including the first execution. Must be >= 1. */
  readonly maxAttempts: number;
  readonly delayMs: number;
}

export interface ExponentialRetryPolicySpec {
  readonly kind: "exponential";
  /** Total attempts including the first execution. Must be >= 1. */
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly multiplier: number;
  readonly maxDelayMs?: number;
  /** When true, each delay is multiplied by a random factor in [1, 1.2). */
  readonly jitter?: boolean;
}
