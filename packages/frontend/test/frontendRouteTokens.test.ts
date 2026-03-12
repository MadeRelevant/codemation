import { describe, expect, it } from "vitest";
import { FrontendRouteTokens } from "../src/frontend/frontendRouteTokens";

describe("FrontendRouteTokens", () => {
  it("uses stable global symbols for route handlers and runtime providers", () => {
    expect(FrontendRouteTokens.PreparedExecutionRuntimeProvider).toBe(Symbol.for("codemation.frontend.PreparedExecutionRuntimeProvider"));
    expect(FrontendRouteTokens.FrontendRuntimeProvider).toBe(Symbol.for("codemation.frontend.FrontendRuntimeProvider"));
    expect(FrontendRouteTokens.WorkflowRouteHandler).toBe(Symbol.for("codemation.frontend.WorkflowRouteHandler"));
    expect(FrontendRouteTokens.RunRouteHandler).toBe(Symbol.for("codemation.frontend.RunRouteHandler"));
    expect(FrontendRouteTokens.RealtimeRouteHandler).toBe(Symbol.for("codemation.frontend.RealtimeRouteHandler"));
    expect(FrontendRouteTokens.WebhookRouteHandler).toBe(Symbol.for("codemation.frontend.WebhookRouteHandler"));
  });
});
