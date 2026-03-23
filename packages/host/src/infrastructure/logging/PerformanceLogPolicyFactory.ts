import { PerformanceLogPolicy } from "./PerformanceLogPolicy";

/**
 * Process-wide {@link PerformanceLogPolicy} singleton (same pattern as {@link LogLevelPolicyFactory}).
 */
export class PerformanceLogPolicyFactory {
  private readonly policy = new PerformanceLogPolicy();

  create(): PerformanceLogPolicy {
    return this.policy;
  }
}

export const performanceLogPolicyFactory = new PerformanceLogPolicyFactory();
