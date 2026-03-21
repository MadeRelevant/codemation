// @vitest-environment node

import { encode } from "@auth/core/jwt";
import type { WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder,ManualTrigger,MapData } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";

class AuthEnforcementFixture {
  static readonly workflowId = "wf.http.auth";
  static readonly secret = "codemation-auth-test-secret-minimum-32-chars-long";

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Auth enforcement",
    })
      .trigger(new ManualTrigger("t", "trigger"))
      .then(new MapData("m", (item) => item.json, "map"))
      .build();
  }

  static createProtectedConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: { kind: "local" },
    };
  }
}

describe("http auth enforcement", () => {
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    harness = new FrontendHttpIntegrationHarness({
      config: AuthEnforcementFixture.createProtectedConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../.."),
      env: {
        AUTH_SECRET: AuthEnforcementFixture.secret,
      },
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("returns 401 for protected API routes when no session is presented", async () => {
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflow(AuthEnforcementFixture.workflowId),
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows anonymous webhook posts", async () => {
    const response = await harness.request({
      method: "POST",
      url: `${ApiPaths.webhooks()}/missing-endpoint`,
    });
    expect(response.statusCode).not.toBe(401);
  });

  it("accepts Authorization Bearer JWT issued with AUTH_SECRET", async () => {
    const token = await encode({
      secret: AuthEnforcementFixture.secret,
      salt: "authjs.session-token",
      token: {
        sub: "integration-user",
        email: "integration@codemation.test",
        name: "Integration",
      },
    });
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflow(AuthEnforcementFixture.workflowId),
      headers: {
        authorization: `Bearer ${encodeURIComponent(token)}`,
      },
    });
    expect(response.statusCode).toBe(200);
  });
});
