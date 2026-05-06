// @vitest-environment node

import "reflect-metadata";

import type { PersistedRunState, WorkflowDefinition } from "@codemation/core";
import { injectable } from "@codemation/core";
import { ManualTriggerNode } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";
import { ApplicationTokens } from "../../src/applicationTokens";

// A node implementation whose constructor always throws — simulating a DI resolution failure
// (e.g. tsyringe cannot inject a required parameter).
@injectable()
class FailingNodeImpl {
  constructor() {
    throw new Error("simulated planning failure");
  }
}

function createPlanningErrorWorkflow(): WorkflowDefinition {
  return {
    id: "wf.planning.error.integration",
    name: "Planning error workflow",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        type: ManualTriggerNode,
        name: "Manual trigger",
        config: {
          kind: "trigger",
          type: ManualTriggerNode,
          name: "Manual trigger",
          continueWhenEmptyOutput: true,
        },
      },
      {
        id: "failing_node",
        kind: "node",
        type: FailingNodeImpl,
        name: "Failing Node",
        config: {
          kind: "node",
          type: FailingNodeImpl,
          name: "Failing Node",
        },
      },
    ],
    edges: [{ from: { nodeId: "trigger", output: "main" }, to: { nodeId: "failing_node", input: "in" } }],
  };
}

class PlanningErrorContext {
  private readonly session = new IntegrationTestDatabaseSession();
  harness: FrontendHttpIntegrationHarness | null = null;
  database: IntegrationDatabase | null = null;
  transaction: PostgresRollbackTransaction | null = null;

  async prepareSharedDatabase(): Promise<void> {
    if (this.session.database) {
      return;
    }
    await this.session.start();
  }

  async start(): Promise<FrontendHttpIntegrationHarness> {
    const database = this.requireSharedDatabase();
    this.transaction = this.session.transaction;

    const workflow = createPlanningErrorWorkflow();
    const baseConfig: CodemationConfig = {
      workflows: [workflow],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
    const config = mergeIntegrationDatabaseRuntime(baseConfig, database);
    const getTransaction = (): PostgresRollbackTransaction | null => this.transaction;
    const harness = new FrontendHttpIntegrationHarness({
      config: {
        ...config,
        register: (context) => {
          config.register?.(context);
          context.registerNode(FailingNodeImpl);
          const tx = getTransaction();
          if (tx) {
            context.registerFactory(ApplicationTokens.PrismaClient, () => {
              const activeTx = getTransaction();
              if (!activeTx) throw new Error("No transaction available.");
              return activeTx.getPrismaClient();
            });
          }
        },
      },
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
    });
    await harness.start();
    this.harness = harness;
    this.database = database;
    return harness;
  }

  async dispose(): Promise<void> {
    if (this.harness) {
      await this.harness.close();
      this.harness = null;
    }
    this.database = null;
    this.transaction = null;
    if (this.session.database) {
      await this.session.afterEach();
      this.transaction = this.session.transaction;
    }
  }

  async closeSharedDatabase(): Promise<void> {
    await this.session.dispose();
  }

  private requireSharedDatabase(): IntegrationDatabase {
    if (!this.session.database) {
      throw new Error("PlanningErrorContext.prepareSharedDatabase() must be called before start().");
    }
    return this.session.database;
  }
}

async function waitForRunTerminal(harness: FrontendHttpIntegrationHarness, runId: string): Promise<PersistedRunState> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.runState(runId),
    });
    if (response.statusCode === 200) {
      const state = response.json<PersistedRunState>();
      if (state.status === "completed" || state.status === "failed") {
        return state;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Run ${runId} did not reach terminal status within the timeout.`);
}

describe("workflow run planning error http integration", () => {
  const context = new PlanningErrorContext();

  beforeAll(async () => {
    await context.prepareSharedDatabase();
  });

  afterEach(async () => {
    await context.dispose();
  });

  afterAll(async () => {
    await context.closeSharedDatabase();
  });

  it("persists a failed node snapshot when planning throws NodeInstantiationError", async () => {
    const harness = await context.start();

    const createRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: "wf.planning.error.integration",
      },
    });

    // The HTTP response from the start-run call must be a success (not 500).
    expect(createRunResponse.runId).toBeDefined();
    expect(createRunResponse.workflowId).toBe("wf.planning.error.integration");

    const terminalState = await waitForRunTerminal(harness, createRunResponse.runId);

    // Run must reach "failed" terminal status.
    expect(terminalState.status).toBe("failed");

    // A per-node snapshot for the failing node must be persisted.
    const nodeSnapshot = terminalState.nodeSnapshotsByNodeId?.["failing_node"];
    expect(nodeSnapshot).toBeDefined();
    expect(nodeSnapshot?.status).toBe("failed");

    // The error message must include the original cause.
    expect(nodeSnapshot?.error?.message).toContain("simulated planning failure");

    // The error name must identify the NodeInstantiationError wrapper.
    expect(nodeSnapshot?.error?.name).toBe("NodeInstantiationError");

    // A stack trace must be present.
    expect(typeof nodeSnapshot?.error?.stack).toBe("string");
    expect((nodeSnapshot?.error?.stack ?? "").length).toBeGreaterThan(0);
  });
});
