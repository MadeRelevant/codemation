import {
  EngineExecutionLimitsPolicy,
  ENGINE_EXECUTION_LIMITS_DEFAULTS,
  type EngineExecutionLimitsPolicyConfig,
} from "./EngineExecutionLimitsPolicy";

/**
 * Builds {@link EngineExecutionLimitsPolicy} by merging {@link ENGINE_EXECUTION_LIMITS_DEFAULTS} with optional `overrides` (e.g. host `runtime.engineExecutionLimits`).
 */
export class EngineExecutionLimitsPolicyFactory {
  create(overrides?: Partial<EngineExecutionLimitsPolicyConfig>): EngineExecutionLimitsPolicy {
    return new EngineExecutionLimitsPolicy({ ...ENGINE_EXECUTION_LIMITS_DEFAULTS, ...overrides });
  }
}
