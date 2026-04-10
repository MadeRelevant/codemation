import { describe, expect, it } from "vitest";

import type {
  PersistedRunState,
  PersistedWorkflowSnapshot,
  WorkflowDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { WorkflowDetailPresenter } from "../../src/features/workflows/lib/workflowDetail/WorkflowDetailPresenter";

describe("WorkflowDetailPresenter.resolveViewedWorkflowForContext", () => {
  it("prefers active live run workflowSnapshot over the live workflow definition", () => {
    const liveWorkflow: WorkflowDto = {
      id: "wf-1",
      name: "Live workflow name",
      active: true,
      nodes: [{ id: "A", kind: "trigger", type: "ManualTrigger" }],
      edges: [],
    };

    const snapshot: PersistedWorkflowSnapshot = {
      id: "wf-1",
      name: "Snapshot workflow name",
      workflowErrorHandlerConfigured: false,
      nodes: [
        {
          id: "A",
          kind: "trigger",
          name: "Trigger",
          nodeTokenId: "ManualTriggerFactory",
          configTokenId: "ManualTrigger",
          config: {},
        },
      ],
      edges: [],
    };

    const activeLiveRun: PersistedRunState = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "pending",
      workflowSnapshot: snapshot,
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };

    const viewed = WorkflowDetailPresenter.resolveViewedWorkflowForContext({
      viewContext: "live-workflow",
      selectedRun: undefined,
      activeLiveRun,
      liveWorkflow,
    });

    expect(viewed?.name).toBe("Snapshot workflow name");
  });
});
