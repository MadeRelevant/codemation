import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowDetailFixtureFactory, WorkflowDetailScreenTestKit } from "./testkit";

describe("workflow detail mutable execution flows", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("pins input and reruns from a mutable execution", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.runToHere();

    await waitFor(() => {
      expect(screen.getByTestId("execution-mode-label")).toHaveTextContent("Manual execution");
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin selected node input" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ pinned: true }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });

    expect(
      kit.latestRequestBodyMatching<Readonly<{ items?: ReadonlyArray<Readonly<{ json: unknown }>> }>>(
        new RegExp(`^PATCH /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/pin$`),
      ),
    ).toEqual({
      items: [{ json: { pinned: true } }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run from selected node" }));

    await kit.waitForRunSummary(WorkflowDetailFixtureFactory.createDerivedRunId());

    expect(
      kit.latestRequestBodyMatching<Readonly<{ mode?: "manual" | "debug" }>>(
        new RegExp(`^POST /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/run$`),
      ),
    ).toEqual({
      mode: "manual",
    });
  });

  it("edits workflow snapshot json for a mutable execution", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.runToHere();

    await waitFor(() => {
      expect(screen.getByTestId("edit-workflow-json-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("edit-workflow-json-button"));
    const snapshot = WorkflowDetailFixtureFactory.createWorkflowSnapshot();
    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: JSON.stringify({ ...snapshot, name: "Edited snapshot" }, null, 2),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-title")).toHaveTextContent("Edited snapshot");
    });
  });

  it("debugs from a mutable execution with edited input", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.runToHere();

    await waitFor(() => {
      expect(screen.getByTestId("debug-selected-node-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("debug-selected-node-button"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ changed: true }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await kit.waitForRunSummary(WorkflowDetailFixtureFactory.createDerivedRunId());

    expect(
      kit.latestRequestBodyMatching<Readonly<{ mode?: "manual" | "debug"; items?: ReadonlyArray<Readonly<{ json: unknown }>> }>>(
        new RegExp(`^POST /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/run$`),
      ),
    ).toEqual({
      mode: "debug",
      items: [{ json: { changed: true } }],
    });
  });
});
