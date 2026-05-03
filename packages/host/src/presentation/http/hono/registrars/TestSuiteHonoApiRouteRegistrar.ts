import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";

import { TestSuiteHttpRouteHandler } from "../../routeHandlers/TestSuiteHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class TestSuiteHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(TestSuiteHttpRouteHandler) private readonly handler: TestSuiteHttpRouteHandler) {}

  register(app: Hono): void {
    app.post("/workflows/:workflowId/test-suite-runs", (c) =>
      this.handler.postStartTestSuiteRun(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.get("/workflows/:workflowId/test-suite-runs", (c) =>
      this.handler.getTestSuiteRuns(c.req.raw, { workflowId: c.req.param("workflowId") }),
    );
    app.get("/test-suite-runs/:testSuiteRunId", (c) =>
      this.handler.getTestSuiteRun(c.req.raw, { testSuiteRunId: c.req.param("testSuiteRunId") }),
    );
    app.get("/test-suite-runs/:testSuiteRunId/assertions", (c) =>
      this.handler.getTestSuiteRunAssertions(c.req.raw, { testSuiteRunId: c.req.param("testSuiteRunId") }),
    );
    app.get("/test-suite-runs/:testSuiteRunId/runs", (c) =>
      this.handler.getTestSuiteRunChildRuns(c.req.raw, { testSuiteRunId: c.req.param("testSuiteRunId") }),
    );
    app.get("/runs/:runId/assertions", (c) =>
      this.handler.getRunAssertions(c.req.raw, { runId: c.req.param("runId") }),
    );
  }
}
