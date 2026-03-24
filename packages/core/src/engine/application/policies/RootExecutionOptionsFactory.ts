import type { RunExecutionOptions } from "../../../types";

import { EngineExecutionLimitsPolicy } from "./EngineExecutionLimitsPolicy";

/**
 * Composition-root factory for effective {@link RunExecutionOptions} of a root run (depth 0).
 * Injects {@link EngineExecutionLimitsPolicy} so defaults and hard ceilings stay consistent with the engine graph.
 */
export class RootExecutionOptionsFactory {
  constructor(private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy) {}

  create(): RunExecutionOptions {
    return this.executionLimitsPolicy.mergeExecutionOptionsForNewRun(undefined, undefined);
  }
}
