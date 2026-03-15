// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import type { RunSummary, WorkflowDefinition } from "@codemation/core";
import { afterEach, describe, expect, it } from "vitest";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";

interface CreateRunResponse {
  readonly runId: string;
  readonly workflowId: string;
  readonly status: string;
  readonly startedAt: string;
}

class WorkflowRunsIntegrationFixture {
  static readonly workflowId = "wf.http.integration";

  static async createHarness(): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; tempDirectory: string }>> {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "codemation-frontend-http-"));
    const config = this.createConfig(tempDirectory);
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
    });
    await harness.start();
    return {
      harness,
      tempDirectory,
    };
  }

  static createConfig(tempDirectory: string): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      runtime: {
        eventBus: {
          kind: "memory",
        },
        scheduler: {
          kind: "local",
        },
      },
    };
  }

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "HTTP integration workflow",
    })
      .trigger(new ManualTrigger("Manual trigger"))
      .then(new MapData("Return payload", (item) => item.json))
      .build();
  }
}

class WorkflowRunsIntegrationContext {
  harness: FrontendHttpIntegrationHarness | null = null;
  tempDirectory: string | null = null;

  async start(): Promise<FrontendHttpIntegrationHarness> {
    const fixture = await WorkflowRunsIntegrationFixture.createHarness();
    this.harness = fixture.harness;
    this.tempDirectory = fixture.tempDirectory;
    return fixture.harness;
  }

  async dispose(): Promise<void> {
    if (this.harness) {
      await this.harness.close();
      this.harness = null;
    }
    if (this.tempDirectory) {
      await rm(this.tempDirectory, { recursive: true, force: true });
      this.tempDirectory = null;
    }
  }
}

describe("workflow runs http integration", () => {
  const context = new WorkflowRunsIntegrationContext();

  afterEach(async () => {
    await context.dispose();
  });

  it("returns an empty list for a workflow with no runs", async () => {
    const harness = await context.start();

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(WorkflowRunsIntegrationFixture.workflowId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReadonlyArray<RunSummary>>()).toEqual([]);
  });

  it("lists a newly created run through the http api", async () => {
    const harness = await context.start();

    const createRunResponse = await harness.requestJson<CreateRunResponse>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      },
    });
    const runsResponse = await harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(WorkflowRunsIntegrationFixture.workflowId),
    });

    expect(createRunResponse.workflowId).toBe(WorkflowRunsIntegrationFixture.workflowId);
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json<ReadonlyArray<RunSummary>>()).toEqual([
      expect.objectContaining({
        runId: createRunResponse.runId,
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      }),
    ]);
  });
});
