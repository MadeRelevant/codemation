// @vitest-environment node

/**
 * Unit test for T7 security fix: NodeSuspensionHandler stamps workspaceId
 * from the optional 5th constructor arg onto each HumanTaskRecord so that
 * HitlCallbackHandler can assert workspace identity in managed mode.
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";
import { SuspensionRequest } from "@codemation/core";
import type { HumanTaskRecord, HumanTaskStore } from "@codemation/core";
import type { HumanTaskHandle } from "@codemation/core";
import { NodeSuspensionHandler } from "../../../../packages/core/src/execution/NodeSuspensionHandler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRunState() {
  return {
    runId: "run_t7_test" as never,
    workflowId: "wf_t7_test" as never,
    status: "running" as const,
    startedAt: new Date().toISOString(),
    outputs: {},
    suspension: [],
    nodeExecutionStatuses: {},
  };
}

function makeRepository(runState: ReturnType<typeof makeMinimalRunState>) {
  const state = { ...runState };
  return {
    load: async () => state as never,
    save: async (s: typeof state) => {
      Object.assign(state, s);
    },
  };
}

/** Collects the HumanTaskRecord passed to create() */
class CapturingTaskStore implements HumanTaskStore {
  readonly created: HumanTaskRecord[] = [];
  async create(record: HumanTaskRecord): Promise<void> {
    this.created.push(record);
  }
  async findById(): Promise<undefined> {
    return undefined;
  }
  async findByResumeTokenHash(): Promise<undefined> {
    return undefined;
  }
  async findPendingForWorkspace(): Promise<[]> {
    return [];
  }
  async findAllPending(): Promise<[]> {
    return [];
  }
  async markDecided(): Promise<void> {}
  async markTimedOut(): Promise<void> {}
  async markAutoAccepted(): Promise<void> {}
  async markCancelled(): Promise<void> {}
  async cancelPendingForRun(): Promise<void> {}
}

function makeSuspensionRequest() {
  return new SuspensionRequest({
    decisionSchema: z.object({ approved: z.boolean() }),
    timeout: "1h",
    onTimeout: "halt",
    subject: { title: "T7 test", summary: "" },
    deliver: async (handle: HumanTaskHandle) => ({ taskId: handle.taskId }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NodeSuspensionHandler — T7 workspaceId stamping", () => {
  it("stamps workspaceId on HumanTaskRecord when provided", async () => {
    const store = new CapturingTaskStore();
    const runState = makeMinimalRunState();
    const repo = makeRepository(runState);
    const handler = new NodeSuspensionHandler(
      repo as never,
      store,
      undefined,
      undefined,
      "ws-managed-123", // workspaceId from PairingConfig in managed mode
    );

    await assert.rejects(
      () =>
        handler.handle({
          runId: "run_t7_test" as never,
          nodeId: "node_approval" as never,
          activationId: "act_1" as never,
          itemIndex: 0,
          suspensionRequest: makeSuspensionRequest(),
          state: runState as never,
        }),
      // RunSuspendedError is expected — it's how the handler signals suspension
    );

    assert.equal(store.created.length, 1);
    assert.equal(store.created[0]!.workspaceId, "ws-managed-123");
  });

  it("leaves workspaceId undefined when not provided (non-managed mode)", async () => {
    const store = new CapturingTaskStore();
    const runState = makeMinimalRunState();
    const repo = makeRepository(runState);
    // No workspaceId arg — simulates non-managed mode
    const handler = new NodeSuspensionHandler(repo as never, store);

    await assert.rejects(() =>
      handler.handle({
        runId: "run_t7_test" as never,
        nodeId: "node_approval" as never,
        activationId: "act_1" as never,
        itemIndex: 0,
        suspensionRequest: makeSuspensionRequest(),
        state: runState as never,
      }),
    );

    assert.equal(store.created.length, 1);
    assert.equal(store.created[0]!.workspaceId, undefined);
  });
});
