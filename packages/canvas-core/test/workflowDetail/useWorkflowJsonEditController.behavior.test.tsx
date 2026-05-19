/**
 * Behavior tests for useWorkflowJsonEditController.
 * Tests state transitions: open/close/save editor with JSON state.
 */
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import { mountHook } from "../testkit/HookTestkit";
import { useWorkflowJsonEditController } from "../../src/hooks/workflowDetail/useWorkflowJsonEditController";

const neverSave = (): Promise<void> => new Promise(() => {});

describe("useWorkflowJsonEditController", () => {
  it("starts with null editor state", () => {
    const { result } = mountHook(() => useWorkflowJsonEditController({ workflowId: "wf-1", onSave: neverSave }));
    expect(result.current.jsonEditorState).toBeNull();
  });

  it("openEditor sets the editor state", () => {
    const { result } = mountHook(() => useWorkflowJsonEditController({ workflowId: "wf-1", onSave: neverSave }));
    const state = { mode: "workflow-snapshot" as const, title: "Test", value: "{}" };
    act(() => {
      result.current.openEditor(state);
    });
    expect(result.current.jsonEditorState).toEqual(state);
  });

  it("closeJsonEditor resets editor state to null", () => {
    const { result } = mountHook(() => useWorkflowJsonEditController({ workflowId: "wf-1", onSave: neverSave }));
    const state = { mode: "workflow-snapshot" as const, title: "T", value: "{}" };
    act(() => {
      result.current.openEditor(state);
    });
    act(() => {
      result.current.closeJsonEditor();
    });
    expect(result.current.jsonEditorState).toBeNull();
  });

  it("saveJsonEditor is a no-op when no editor state is set", () => {
    // Should not throw
    const { result } = mountHook(() => useWorkflowJsonEditController({ workflowId: "wf-1", onSave: neverSave }));
    act(() => {
      result.current.saveJsonEditor("{}");
    });
    expect(result.current.jsonEditorState).toBeNull();
  });

  it("saveJsonEditor calls onSave and clears state on resolution", async () => {
    let savedValue: string | null = null;
    let resolveSave!: () => void;
    const onSave = (value: string): Promise<void> => {
      savedValue = value;
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    };

    const { result } = mountHook(() => useWorkflowJsonEditController({ workflowId: "wf-1", onSave }));

    const state = { mode: "workflow-snapshot" as const, title: "Snap", value: '{"a":1}' };
    act(() => {
      result.current.openEditor(state);
    });

    act(() => {
      result.current.saveJsonEditor('{"a":2}');
    });
    expect(savedValue).toBe('{"a":2}');
    // State is not yet cleared — save promise not resolved
    expect(result.current.jsonEditorState).not.toBeNull();

    // Resolve the save promise — state should clear
    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
    expect(result.current.jsonEditorState).toBeNull();
  });
});
