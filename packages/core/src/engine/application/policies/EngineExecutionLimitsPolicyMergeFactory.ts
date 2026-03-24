import { EngineExecutionLimitsPolicy, ENGINE_EXECUTION_LIMITS_DEFAULTS, type EngineExecutionLimitsPolicyConfig } from "./EngineExecutionLimitsPolicy";

/**
 * Composition-root helper: builds {@link EngineExecutionLimitsPolicy} from defaults plus optional host overrides.
 */
export class EngineExecutionLimitsPolicyMergeFactory {
  create(overrides?: Partial<EngineExecutionLimitsPolicyConfig>): EngineExecutionLimitsPolicy {
    return new EngineExecutionLimitsPolicy({ ...ENGINE_EXECUTION_LIMITS_DEFAULTS, ...overrides });
  }
}
