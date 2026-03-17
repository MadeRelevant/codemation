import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkflowDetailFixtureFactory,
  WorkflowDetailRealtimeFixtureFactory,
  WorkflowDetailScreenTestKit,
  WorkflowExecutionTreeAssertions,
  WorkflowStatusAssertions,
} from "./testkit";

describe("workflow detail realtime flows", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("applies realtime node status updates for workflow nodes and agent attachments", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());

    WorkflowStatusAssertions.expectStatuses(kit.container, {
      [WorkflowDetailFixtureFactory.triggerNodeId]: "pending",
      [WorkflowDetailFixtureFactory.nodeOneId]: "pending",
      [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
      [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
      [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
    });

    await kit.startRun();

    kit.expectCallCount("GET /api/workflows/wf.frontend.realtime/runs", 1);
    kit.expectCallCount("POST /api/runs", 1);

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runCreated());
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.triggerNodeId, 0));

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "pending",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.nodeOneId]: "running",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    await kit.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.agentNodeId, 2));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "running",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3));
    await kit.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "running",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4));
    await kit.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.agentNodeId, 5));
    await kit.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.nodeTwoId]: "running",
      });
    });

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runSaved());
    await kit.waitForStatusVisibilityWindow();

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
      WorkflowExecutionTreeAssertions.expectNodePresence([
        WorkflowDetailFixtureFactory.llmFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.toolFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.llmSecondInvocationNodeId,
      ]);
    });

    kit.openExecutionsPane();
    await waitFor(() => {
      expect(screen.getByTestId(`run-status-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("completed");
    });
  });

  it("keeps agent attachment nodes visible when rendering from a persisted workflow snapshot", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    await waitFor(() => {
      WorkflowStatusAssertions.expectNodePresence(kit!.container, [
        WorkflowDetailFixtureFactory.agentNodeId,
        WorkflowDetailFixtureFactory.llmNodeId,
        WorkflowDetailFixtureFactory.toolNodeId,
      ]);
    });
  });

  it("processes burst websocket messages without dropping intermediate node snapshots", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());
    await kit.startRun();

    kit.emitJsonMessages([
      WorkflowDetailRealtimeFixtureFactory.runCreated(),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.triggerNodeId, 0),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.agentNodeId, 2),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.llmSecondInvocationNodeId, 5),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmSecondInvocationNodeId, 5),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.agentNodeId, 6),
      WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 7),
      WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 7),
    ]);

    await kit.waitForStatusVisibilityWindow();

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
      WorkflowExecutionTreeAssertions.expectNodePresence([
        WorkflowDetailFixtureFactory.llmFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.toolFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.llmSecondInvocationNodeId,
      ]);
    });
  });

  it("does not leave the live workflow running when a completed runSaved arrives before the trailing nodeCompleted event", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());
    await kit.startRun();

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runCreated());
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runSaved());
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    await kit.waitForStatusVisibilityWindow();

    await waitFor(() => {
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
    });
  });

  it("treats a terminal nodeCompleted event as finished when the final runSaved message is missing", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());
    await kit.startRun();

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runCreated());
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    await kit.waitForStatusVisibilityWindow();

    await waitFor(() => {
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
      WorkflowStatusAssertions.expectStatuses(kit!.container, {
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
    });
  });
});
