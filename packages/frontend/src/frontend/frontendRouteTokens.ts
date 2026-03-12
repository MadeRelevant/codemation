import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { TypeToken } from "@codemation/core";
import type { CodemationPreparedExecutionRuntime } from "../codemationRuntimeContracts";
import type { CodemationFrontendRuntimeRoot } from "../runtime/codemationFrontendRuntimeRoot";
import type { RealtimeRouteHandler } from "./RealtimeRouteHandler";
import type { RunRouteHandler } from "./RunRouteHandler";
import type { WebhookRouteHandler } from "./WebhookRouteHandler";
import type { WorkflowRouteHandler } from "./WorkflowRouteHandler";

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
  PreparedExecutionRuntimeProvider: Symbol.for("codemation.frontend.PreparedExecutionRuntimeProvider") as TypeToken<PreparedExecutionRuntimeProvider>,
  FrontendRuntimeProvider: Symbol.for("codemation.frontend.FrontendRuntimeProvider") as TypeToken<FrontendRuntimeProvider>,
  WorkflowRouteHandler: Symbol.for("codemation.frontend.WorkflowRouteHandler") as TypeToken<WorkflowRouteHandler>,
  RunRouteHandler: Symbol.for("codemation.frontend.RunRouteHandler") as TypeToken<RunRouteHandler>,
  RealtimeRouteHandler: Symbol.for("codemation.frontend.RealtimeRouteHandler") as TypeToken<RealtimeRouteHandler>,
  WebhookRouteHandler: Symbol.for("codemation.frontend.WebhookRouteHandler") as TypeToken<WebhookRouteHandler>,
} as const;
