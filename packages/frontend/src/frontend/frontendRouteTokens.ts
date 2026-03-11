import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { CodemationPreparedExecutionRuntime } from "../codemationRuntimeContracts";
import type { CodemationFrontendRuntimeRoot } from "../runtime/codemationFrontendRuntimeRoot";

export interface PreparedExecutionRuntimeProvider {
  getPreparedExecutionRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationPreparedExecutionRuntime>;
}

export interface FrontendRuntimeProvider {
  getRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationFrontendRuntimeRoot>;
}

export const FrontendRouteTokens = {
  PreparedExecutionRuntimeProvider: Symbol("PreparedExecutionRuntimeProvider"),
  FrontendRuntimeProvider: Symbol("FrontendRuntimeProvider"),
  RealtimeRouteHandler: Symbol("RealtimeRouteHandler"),
} as const;
