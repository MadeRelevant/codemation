import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowDetailRealtimeFixtureFactory, WorkflowDetailScreenTestKit } from "./testkit";

describe("workflow detail inspector resize", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    kit?.dispose();
    kit = null;
  });

  it("locks body selection and cursor while resizing the execution inspector", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed());

    const resizeHandle = await screen.findByTestId("workflow-detail-inspector-resize-handle");

    fireEvent.mouseDown(resizeHandle, { clientY: 500 });

    expect(document.body.style.cursor).toBe("row-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.mouseMove(window, { clientY: 460 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(document.body.style.cursor).toBe("");
      expect(document.body.style.userSelect).toBe("");
    });
  });
});
