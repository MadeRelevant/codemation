import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowDetailRealtimeFixtureFactory, WorkflowDetailScreenTestKit } from "./testkit";

describe("workflow detail node properties panel", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("opens from canvas clicks and selects the same node in the execution inspector", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());

    const selectedNodeName = await screen.findByTestId("selected-node-name");
    const initialInspectorName = selectedNodeName.textContent ?? "";
    const target = initialInspectorName.includes("Node 2")
      ? { nodeId: "agent", displayName: "Agent" }
      : { nodeId: "node_2", displayName: "Node 2" };

    const targetCard = await screen.findByTestId(`canvas-node-card-${target.nodeId}`);
    fireEvent.click(targetCard);

    const panel = await screen.findByTestId("node-properties-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-panel-title")).toHaveTextContent(target.displayName);
    expect(screen.getByTestId("node-properties-config-section")).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-credential-section")).toBeInTheDocument();
    expect(targetCard).toHaveAttribute("data-codemation-properties-target", "true");

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-name")).toHaveTextContent(target.displayName);
      expect(screen.getByTestId("node-properties-panel-title")).toHaveTextContent(target.displayName);
    });

    fireEvent.click(screen.getByTestId("node-properties-panel-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("node-properties-panel")).not.toBeInTheDocument();
    });
    expect(targetCard).toHaveAttribute("data-codemation-properties-target", "false");
  });

  it("shows the workflow rebuild indicator and spinner above the open properties panel", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());

    const selectedNodeName = await screen.findByTestId("selected-node-name");
    const initialInspectorName = selectedNodeName.textContent ?? "";
    const targetNodeId = initialInspectorName.includes("Node 2") ? "agent" : "node_2";

    fireEvent.click(await screen.findByTestId(`canvas-node-card-${targetNodeId}`));
    await screen.findByTestId("node-properties-panel");

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.devBuildStarted());
    await waitFor(() => {
      expect(screen.getByTestId("workflow-dev-build-started-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("workflow-dev-build-reload-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-dev-build-started-indicator")).toHaveTextContent("Rebuilding workflow...");
  });
});
