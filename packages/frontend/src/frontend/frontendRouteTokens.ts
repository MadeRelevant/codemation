import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { TypeToken } from "@codemation/core";
import type { CodemationPreparedExecutionRuntime } from "../codemationRuntimeContracts";
import type { CodemationFrontendRuntimeRoot } from "../runtime/codemationFrontendRuntimeRoot";
import type { RealtimeRouteHandler } from "./RealtimeRouteHandler";

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
  PreparedExecutionRuntimeProvider: Symbol("PreparedExecutionRuntimeProvider") as TypeToken<PreparedExecutionRuntimeProvider>,
  FrontendRuntimeProvider: Symbol("FrontendRuntimeProvider") as TypeToken<FrontendRuntimeProvider>,
  RealtimeRouteHandler: Symbol("RealtimeRouteHandler") as TypeToken<RealtimeRouteHandler>,
} as const;
