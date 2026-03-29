import type {
  ExponentialRetryPolicySpec,
  FixedRetryPolicySpec,
  RetryPolicySpec,
} from "../contracts/retryPolicySpec.types";
import type { AsyncSleeper } from "./asyncSleeper.types";

export type { AsyncSleeper } from "./asyncSleeper.types";

type NormalizedPolicy =
  | { readonly kind: "none"; readonly maxAttempts: 1 }
  | { readonly kind: "fixed"; readonly maxAttempts: number; readonly delayMs: number }
  | {
      readonly kind: "exponential";
      readonly maxAttempts: number;
      readonly initialDelayMs: number;
      readonly multiplier: number;
      readonly maxDelayMs?: number;
      readonly jitter?: boolean;
    };

export class InProcessRetryRunner {
  constructor(private readonly sleeper: AsyncSleeper) {}

  async run<T>(policy: RetryPolicySpec | undefined, work: () => Promise<T>): Promise<T> {
    const spec = InProcessRetryRunner.normalizePolicy(policy);
    let lastError: unknown;
    for (let attempt = 1; attempt <= spec.maxAttempts; attempt++) {
      try {
        return await work();
      } catch (error) {
        lastError = error;
        if (attempt >= spec.maxAttempts) {
          break;
        }
        const delayMs = InProcessRetryRunner.delayAfterFailureMs(spec, attempt);
        await this.sleeper.sleep(delayMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private static delayAfterFailureMs(spec: NormalizedPolicy, failedAttempt: number): number {
    if (spec.kind === "none") {
      return 0;
    }
    if (spec.kind === "fixed") {
      return spec.delayMs;
    }
    const exponent = failedAttempt - 1;
    let ms = spec.initialDelayMs * Math.pow(spec.multiplier, exponent);
    if (spec.jitter === true) {
      ms *= 1 + Math.random() * 0.2;
    }
    if (spec.maxDelayMs !== undefined && ms > spec.maxDelayMs) {
      ms = spec.maxDelayMs;
    }
    return Math.max(0, Math.floor(ms));
  }

  private static normalizePolicy(policy: RetryPolicySpec | undefined): NormalizedPolicy {
    if (policy === undefined) {
      return { kind: "none", maxAttempts: 1 };
    }
    if (typeof policy !== "object" || policy === null) {
      return { kind: "none", maxAttempts: 1 };
    }
    const kind = (policy as { kind?: unknown }).kind;
    if (kind === "none") {
      return { kind: "none", maxAttempts: 1 };
    }
    if (kind === "fixed") {
      const p = policy as FixedRetryPolicySpec;
      const maxAttempts = InProcessRetryRunner.assertPositiveInt(p.maxAttempts, "fixed.maxAttempts");
      const delayMs = InProcessRetryRunner.assertNonNegativeFinite(p.delayMs, "fixed.delayMs");
      return { kind: "fixed", maxAttempts, delayMs };
    }
    if (kind === "exponential") {
      const p = policy as ExponentialRetryPolicySpec;
      return {
        kind: "exponential",
        maxAttempts: InProcessRetryRunner.assertPositiveInt(p.maxAttempts, "exponential.maxAttempts"),
        initialDelayMs: InProcessRetryRunner.assertNonNegativeFinite(p.initialDelayMs, "exponential.initialDelayMs"),
        multiplier: InProcessRetryRunner.assertMultiplier(p.multiplier),
        maxDelayMs:
          p.maxDelayMs === undefined
            ? undefined
            : InProcessRetryRunner.assertNonNegativeFinite(p.maxDelayMs, "exponential.maxDelayMs"),
        jitter: p.jitter === true,
      };
    }
    return { kind: "none", maxAttempts: 1 };
  }

  private static assertPositiveInt(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
      throw new Error(`Retry policy ${label} must be a positive integer`);
    }
    return value;
  }

  private static assertNonNegativeFinite(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Retry policy ${label} must be a non-negative finite number`);
    }
    return value;
  }

  private static assertMultiplier(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
      throw new Error(`Retry policy exponential.multiplier must be >= 1`);
    }
    return value;
  }
}
