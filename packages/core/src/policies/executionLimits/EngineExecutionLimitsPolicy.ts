import type { ParentExecutionRef, RunExecutionOptions } from "../../types";

export interface EngineExecutionLimitsPolicyConfig {
  readonly defaultMaxNodeActivations: number;
  readonly hardMaxNodeActivations: number;
  readonly defaultMaxSubworkflowDepth: number;
  readonly hardMaxSubworkflowDepth: number;
}

/** Framework defaults for {@link EngineExecutionLimitsPolicy} (merged with host `runtime.engineExecutionLimits`). */
export const ENGINE_EXECUTION_LIMITS_DEFAULTS: EngineExecutionLimitsPolicyConfig = {
  defaultMaxNodeActivations: 100_000,
  hardMaxNodeActivations: 100_000,
  defaultMaxSubworkflowDepth: 32,
  hardMaxSubworkflowDepth: 32,
};

/**
 * Resolves per-run execution limits: defaults, hard ceilings, and subworkflow depth for new runs.
 */
export class EngineExecutionLimitsPolicy {
  constructor(private readonly config: EngineExecutionLimitsPolicyConfig = ENGINE_EXECUTION_LIMITS_DEFAULTS) {}

  /**
   * Effective options for a new root run (depth 0): defaults merged with engine ceilings.
   * Replaces a separate one-method factory for root-run bootstrap.
   */
  createRootExecutionOptions(): RunExecutionOptions {
    return this.mergeExecutionOptionsForNewRun(undefined, undefined);
  }

  mergeExecutionOptionsForNewRun(
    parent: ParentExecutionRef | undefined,
    user: RunExecutionOptions | undefined,
  ): RunExecutionOptions {
    const subworkflowDepth = parent === undefined ? 0 : (parent.subworkflowDepth ?? 0) + 1;
    const inheritedMaxNode = parent?.engineMaxNodeActivations;
    const inheritedMaxSub = parent?.engineMaxSubworkflowDepth;
    const maxNodeActivations = this.capNumber(
      user?.maxNodeActivations ?? inheritedMaxNode,
      this.config.defaultMaxNodeActivations,
      this.config.hardMaxNodeActivations,
    );
    const maxSubworkflowDepth = this.capNumber(
      user?.maxSubworkflowDepth ?? inheritedMaxSub,
      this.config.defaultMaxSubworkflowDepth,
      this.config.hardMaxSubworkflowDepth,
    );
    if (subworkflowDepth > maxSubworkflowDepth) {
      throw new Error(
        `Subworkflow nesting depth ${subworkflowDepth} exceeds maxSubworkflowDepth ${maxSubworkflowDepth} (run would be a child of parent run).`,
      );
    }
    return {
      ...user,
      subworkflowDepth,
      maxNodeActivations,
      maxSubworkflowDepth,
    };
  }

  private capNumber(requested: number | undefined, defaultValue: number, hardCeiling: number): number {
    const base = requested === undefined ? defaultValue : requested;
    return Math.min(base, hardCeiling);
  }
}
