// @vitest-environment node

import type { WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, WebhookTrigger } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "./testkit/IntegrationDatabaseFactory";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";

class WorkflowActivationIntegrationFixture {
  static readonly manualOnlyWorkflowId = "wf.http.activation.manual";
  static readonly webhookWorkflowId = "wf.http.activation.webhook";

  static createConfig(): CodemationConfig {
    return {
      workflows: [this.createManualOnlyWorkflow(), this.createWebhookWorkflow()],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  static createManualOnlyWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.manualOnlyWorkflowId,
      name: "Activation manual only",
    })
      .trigger(new ManualTrigger("Manual trigger", "tr-manual"))
      .build();
  }

  static createWebhookWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.webhookWorkflowId,
      name: "Activation webhook",
    })
      .trigger(
        new WebhookTrigger(
          "Webhook trigger",
          {
            endpointKey: "activation-test",
            methods: ["POST"],
          },
          undefined,
          "tr-webhook",
        ),
      )
      .build();
  }
}

describe("workflow activation HTTP", () => {
  let database: IntegrationDatabase;
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    database = await IntegrationDatabaseFactory.create();
    harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(WorkflowActivationIntegrationFixture.createConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
    await database.close();
  });

  it("rejects activation with validation errors when the workflow only has a manual trigger", async () => {
    const response = await harness.request({
      method: "PATCH",
      url: ApiPaths.workflowActivation(WorkflowActivationIntegrationFixture.manualOnlyWorkflowId),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ active: true }),
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; errors?: ReadonlyArray<string> }>();
    expect(body.error).toBe("Workflow cannot be activated.");
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it("allows deactivation even when the workflow only has a manual trigger", async () => {
    const response = await harness.request({
      method: "PATCH",
      url: ApiPaths.workflowActivation(WorkflowActivationIntegrationFixture.manualOnlyWorkflowId),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ active: false }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ active: boolean }>().active).toBe(false);
  });

  it("activates when a non-manual trigger exists and persists active state", async () => {
    const activate = await harness.request({
      method: "PATCH",
      url: ApiPaths.workflowActivation(WorkflowActivationIntegrationFixture.webhookWorkflowId),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ active: true }),
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json<{ active: boolean }>().active).toBe(true);

    const detail = await harness.request({
      method: "GET",
      url: ApiPaths.workflow(WorkflowActivationIntegrationFixture.webhookWorkflowId),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ active: boolean }>().active).toBe(true);
  });
});
