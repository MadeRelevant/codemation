// @vitest-environment node

import {
  CoreTokens,
  type CredentialSessionService,
  type PersistedRunState,
  type WorkflowDefinition,
} from "@codemation/core";
import { createWorkflowBuilder, MapData } from "@codemation/core-nodes";
import { GmailNodes, OnNewGmailTrigger, type GmailSession } from "@codemation/core-nodes-gmail";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";

class FakeGoogleGmailAttachmentsApi {
  async get(): Promise<Readonly<{ data: Readonly<{ data: string; size: number }> }>> {
    return {
      data: {
        data: "",
        size: 0,
      },
    };
  }
}

class FakeGoogleGmailMessagesApi {
  readonly attachments = new FakeGoogleGmailAttachmentsApi();

  async list(): Promise<Readonly<{ data: Readonly<{ messages: ReadonlyArray<Readonly<{ id: string }>> }> }>> {
    return {
      data: {
        messages: [{ id: "message_1" }],
      },
    };
  }

  async get(): Promise<
    Readonly<{
      data: Readonly<{
        id: string;
        historyId: string;
        snippet: string;
        labelIds: ReadonlyArray<string>;
        payload: Readonly<{
          headers: ReadonlyArray<Readonly<{ name: string; value: string }>>;
        }>;
      }>;
    }>
  > {
    return {
      data: {
        id: "message_1",
        historyId: "history_1",
        snippet: "Need a quote",
        labelIds: ["IMPORTANT"],
        payload: {
          headers: [
            { name: "Subject", value: "Quote request" },
            { name: "From", value: "buyer@example.com" },
            { name: "To", value: "sales@example.com" },
          ],
        },
      },
    };
  }
}

class FakeGoogleGmailLabelsApi {
  async list(): Promise<
    Readonly<{ data: Readonly<{ labels: ReadonlyArray<Readonly<{ id: string; name: string }>> }> }>
  > {
    return {
      data: {
        labels: [{ id: "IMPORTANT", name: "IMPORTANT" }],
      },
    };
  }
}

class FakeGoogleGmailUsersApi {
  readonly messages = new FakeGoogleGmailMessagesApi();
  readonly labels = new FakeGoogleGmailLabelsApi();

  async getProfile(): Promise<Readonly<{ data: Readonly<{ historyId: string }> }>> {
    return {
      data: {
        historyId: "history_1",
      },
    };
  }
}

class FakeGoogleGmailClient {
  readonly users = new FakeGoogleGmailUsersApi();
}

class FakeGmailCredentialSessionService implements CredentialSessionService {
  private readonly session: GmailSession = {
    auth: {} as never,
    client: new FakeGoogleGmailClient() as never,
    userId: "me",
    emailAddress: "sales@example.com",
    scopes: [],
  };

  async getSession<TSession = unknown>(): Promise<TSession> {
    return this.session as TSession;
  }
}

class GmailRunToMapNodeRegressionFixture {
  static readonly workflowId = "wf.gmail.run-to-map.regression";
  static readonly gmailTriggerNodeId = "gmail_trigger";
  static readonly mapNodeId = "map_data";

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Gmail run-to-map regression",
    })
      .trigger(
        new OnNewGmailTrigger(
          "New Gmail",
          {
            mailbox: "sales@example.com",
          },
          this.gmailTriggerNodeId,
        ),
      )
      .then(new MapData("Map data", (item) => item.json, { id: this.mapNodeId }))
      .build();
  }

  static createConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      plugins: [new GmailNodes()],
      register: (context) => {
        context.registerValue(CoreTokens.CredentialSessionService, new FakeGmailCredentialSessionService());
      },
      runtime: {
        eventBus: {
          kind: "memory",
        },
        scheduler: {
          kind: "local",
        },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  static async waitForRunToReachTerminalState(
    harness: FrontendHttpIntegrationHarness,
    runId: string,
  ): Promise<PersistedRunState> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.runState(runId),
      });
      if (response.statusCode !== 200) {
        await this.delay(50);
        continue;
      }
      const state = response.json<PersistedRunState>();
      if (state.status === "completed" || state.status === "failed") {
        return state;
      }
      await this.delay(50);
    }
    throw new Error(`Run ${runId} did not reach a terminal state before the timeout elapsed.`);
  }

  static throwPersistedNodeError(state: PersistedRunState, nodeId: string): never {
    const snapshot = state.nodeSnapshotsByNodeId[nodeId];
    const persistedError = snapshot?.error;
    if (!persistedError) {
      throw new Error(`Expected persisted error for node ${nodeId} but none was found.`);
    }
    const error = new Error(persistedError.message);
    error.name = persistedError.name ?? "Error";
    error.stack = persistedError.stack;
    throw error;
  }

  private static async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

describe("gmail run-to-map regression (manual run from downstream node)", () => {
  let harness: FrontendHttpIntegrationHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = null;
    }
  });

  it("should synthesize a Gmail test event when running to the map node (currently reproduces Gmail manual-run error)", async () => {
    harness = new FrontendHttpIntegrationHarness({
      config: GmailRunToMapNodeRegressionFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
    });
    await harness.start();

    const runResult = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: GmailRunToMapNodeRegressionFixture.workflowId,
        stopAt: GmailRunToMapNodeRegressionFixture.mapNodeId,
        clearFromNodeId: GmailRunToMapNodeRegressionFixture.mapNodeId,
        mode: "manual",
        items: [],
        synthesizeTriggerItems: false,
      },
    });

    const state = await GmailRunToMapNodeRegressionFixture.waitForRunToReachTerminalState(harness, runResult.runId);

    if (state.status === "failed") {
      GmailRunToMapNodeRegressionFixture.throwPersistedNodeError(
        state,
        GmailRunToMapNodeRegressionFixture.gmailTriggerNodeId,
      );
    }

    expect(state.status).toBe("completed");
    expect(state.nodeSnapshotsByNodeId[GmailRunToMapNodeRegressionFixture.mapNodeId]?.status).toBe("completed");
    expect(state.outputsByNode[GmailRunToMapNodeRegressionFixture.mapNodeId]?.main?.length ?? 0).toBeGreaterThan(0);
  });
});
