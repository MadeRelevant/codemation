import { fireEvent,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it } from "vitest";
import { WorkflowDetailRealtimeFixtureFactory,WorkflowDetailScreenTestKit } from "./testkit";

describe("workflow detail node properties panel", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("opens from canvas clicks and stays independent from inspector focus", async () => {
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
      expect(screen.getByTestId("selected-node-name")).toHaveTextContent(initialInspectorName);
      expect(screen.getByTestId("node-properties-panel-title")).toHaveTextContent(target.displayName);
    });

    fireEvent.click(screen.getByTestId("node-properties-panel-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("node-properties-panel")).not.toBeInTheDocument();
    });
    expect(targetCard).toHaveAttribute("data-codemation-properties-target", "false");
  });
});
