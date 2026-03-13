import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowDetailFixtureFactory, WorkflowDetailScreenTestKit } from "./testkit";

describe("workflow detail execution actions", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("posts an empty item batch when manually running a webhook-trigger workflow", async () => {
    kit = WorkflowDetailScreenTestKit.create(
      WorkflowDetailFixtureFactory.createWorkflowDetail({
        triggerKind: "webhook",
        workflowName: "Frontend webhook workflow",
      }),
    ).install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    expect(
      kit.latestRequestBody<Readonly<{ workflowId: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>>("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [],
    });
  });

  it("creates a debug execution when using debug here", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.debugHere();

    await waitFor(() => {
      expect(screen.getByTestId(`run-mode-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("Debug");
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ workflowId: string; mode?: "manual" | "debug"; stopAt?: string; sourceRunId?: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
      stopAt: WorkflowDetailFixtureFactory.triggerNodeId,
      mode: "debug",
    });
  });

  it("creates a manual execution for run to here", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.runToHere();

    await waitFor(() => {
      expect(screen.getByTestId(`run-mode-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("Manual");
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ workflowId: string; mode?: "manual" | "debug"; stopAt?: string; sourceRunId?: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
      stopAt: WorkflowDetailFixtureFactory.triggerNodeId,
      mode: "manual",
    });
  });
});
