// @vitest-environment jsdom

import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowJsonEditorMount } from "../../src/screens/WorkflowJsonEditorMount";
import { WorkflowCanvasApiClientProvider } from "@codemation/canvas-core";
import type { JsonEditorState, WorkflowJsonEditorSlotProps, WorkflowCanvasApiClient } from "@codemation/canvas-core";

/**
 * A minimal no-op API client for tests that render the default WorkflowJsonEditorDialog,
 * which calls useWorkflowCanvasApiClient() and would throw without a provider.
 */
const noopApiClient: WorkflowCanvasApiClient = {
  fetchWorkflows: async () => [],
  fetchWorkflow: async () => {
    throw new Error("not implemented");
  },
  fetchWorkflowRuns: async () => [],
  fetchWorkflowDebuggerOverlay: async () => {
    throw new Error("not implemented");
  },
  fetchRun: async () => {
    throw new Error("not implemented");
  },
  fetchRunDetail: async () => {
    throw new Error("not implemented");
  },
  fetchTelemetryRunTrace: async () => {
    throw new Error("not implemented");
  },
  fetchCredentialTypes: async () => [],
  fetchCredentialFieldEnvStatus: async () => ({}),
  fetchCredentialInstances: async () => [],
  fetchCredentialInstanceWithSecrets: async () => {
    throw new Error("not implemented");
  },
  fetchWorkflowCredentialHealth: async () => {
    throw new Error("not implemented");
  },
  fetchUserAccounts: async () => [],
  fetchWorkflowTestSuiteRuns: async () => [],
  fetchTestSuiteRunDetail: async () => {
    throw new Error("not implemented");
  },
  fetchTestSuiteRunAssertions: async () => [],
  fetchRunAssertions: async () => [],
  fetchTestSuiteRunChildRuns: async () => [],
  fetchAssertionMetricTrends: async () => [],
  postStartTestSuiteRun: async () => {
    throw new Error("not implemented");
  },
  patchWorkflowActivation: async () => {
    throw new Error("not implemented");
  },
  postRunWorkflow: async () => {
    throw new Error("not implemented");
  },
  postRunNode: async () => {
    throw new Error("not implemented");
  },
  patchRunNodePin: async () => {
    throw new Error("not implemented");
  },
  patchRunWorkflowSnapshot: async () => {
    throw new Error("not implemented");
  },
  putWorkflowDebuggerOverlay: async () => {
    throw new Error("not implemented");
  },
  postWorkflowDebuggerOverlayCopyRun: async () => {
    throw new Error("not implemented");
  },
  postUserInvite: async () => {
    throw new Error("not implemented");
  },
  postUserInviteRegenerate: async () => {
    throw new Error("not implemented");
  },
  patchUserStatus: async () => {
    throw new Error("not implemented");
  },
  postWorkflowDebuggerOverlayBinaryUpload: async () => {
    throw new Error("not implemented");
  },
};

const baseState: JsonEditorState = {
  mode: "workflow-snapshot",
  title: "Edit JSON",
  value: "[]",
};

describe("WorkflowJsonEditorMount — renderWorkflowJsonEditor slot", () => {
  it("without override: built-in WorkflowJsonEditorDialog renders", () => {
    render(
      <WorkflowCanvasApiClientProvider value={noopApiClient}>
        <WorkflowJsonEditorMount state={baseState} onClose={() => {}} onSave={() => {}} />
      </WorkflowCanvasApiClientProvider>,
    );
    // The built-in dialog renders with testId="workflow-json-editor-dialog"
    expect(document.body.querySelector("[data-testid='workflow-json-editor-dialog']")).not.toBeNull();
  });

  it("with override: provided component renders, built-in does not", () => {
    const renderOverride = vi.fn((_props: WorkflowJsonEditorSlotProps) => (
      <div data-testid="custom-json-editor-override">Custom JSON Editor</div>
    ));

    const { container } = render(
      <WorkflowCanvasApiClientProvider value={noopApiClient}>
        <WorkflowJsonEditorMount
          state={baseState}
          onClose={() => {}}
          onSave={() => {}}
          renderOverride={renderOverride}
        />
      </WorkflowCanvasApiClientProvider>,
    );

    // The override renders inside the container wrapper (not in a portal)
    expect(within(container).getByTestId("custom-json-editor-override")).toBeInTheDocument();
    expect(within(container).queryByTestId("workflow-json-editor-dialog")).toBeNull();
    expect(renderOverride).toHaveBeenCalledWith(expect.objectContaining({ state: baseState }));
  });

  it("with override + updated state: the override receives updated context", () => {
    const receivedStates: JsonEditorState[] = [];
    const renderOverride = (props: WorkflowJsonEditorSlotProps) => {
      receivedStates.push(props.state);
      return <div data-testid="custom-json-editor-rerender">{props.state.title}</div>;
    };

    const stateA: JsonEditorState = { mode: "workflow-snapshot", title: "Editor A", value: "[1]" };
    const stateB: JsonEditorState = { mode: "workflow-snapshot", title: "Editor B", value: "[2]" };

    const { container, rerender } = render(
      <WorkflowCanvasApiClientProvider value={noopApiClient}>
        <WorkflowJsonEditorMount state={stateA} onClose={() => {}} onSave={() => {}} renderOverride={renderOverride} />
      </WorkflowCanvasApiClientProvider>,
    );

    expect(within(container).getByTestId("custom-json-editor-rerender")).toHaveTextContent("Editor A");

    rerender(
      <WorkflowCanvasApiClientProvider value={noopApiClient}>
        <WorkflowJsonEditorMount state={stateB} onClose={() => {}} onSave={() => {}} renderOverride={renderOverride} />
      </WorkflowCanvasApiClientProvider>,
    );

    expect(within(container).getByTestId("custom-json-editor-rerender")).toHaveTextContent("Editor B");
    expect(receivedStates).toContainEqual(stateA);
    expect(receivedStates).toContainEqual(stateB);
  });
});
