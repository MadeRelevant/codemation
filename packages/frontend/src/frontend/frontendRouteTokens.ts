import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { CodemationPreparedExecutionRuntime } from "../runtime/codemationNextRuntimeRegistry";

export interface PreparedExecutionRuntimeProvider {
  getPreparedExecutionRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationPreparedExecutionRuntime>;
}

export const FrontendRouteTokens = {
  PreparedExecutionRuntimeProvider: Symbol("PreparedExecutionRuntimeProvider"),
} as const;
