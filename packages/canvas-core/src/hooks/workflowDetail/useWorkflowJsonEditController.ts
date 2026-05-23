"use client";
import { useCallback, useEffect, useState } from "react";
import type { JsonEditorState, PinBinaryMapsByItemIndex } from "../../lib/workflowDetail/workflowDetailTypes";
import type { WorkflowJsonEditControllerReturn } from "../../types/workflowDetail/WorkflowJsonEditControllerReturn.types";

export function useWorkflowJsonEditController(
  args: Readonly<{
    workflowId: string;
    /**
     * Save handler provided by the façade. Routes to pin.commitPinEdit or
     * run's persistWorkflowSnapshotUpdate depending on the active editor mode.
     * Must return a Promise — the dialog closes on resolution.
     */
    onSave: (value: string, binaryMaps: PinBinaryMapsByItemIndex | undefined, state: JsonEditorState) => Promise<void>;
  }>,
): WorkflowJsonEditControllerReturn {
  const { workflowId, onSave } = args;

  const [jsonEditorState, setJsonEditorState] = useState<JsonEditorState | null>(null);

  // Reset editor state when workflowId changes.
  useEffect(() => {
    setJsonEditorState(null);
  }, [workflowId]);

  const openEditor = useCallback((state: JsonEditorState) => {
    setJsonEditorState(state);
  }, []);

  const closeJsonEditor = useCallback(() => {
    setJsonEditorState(null);
  }, []);

  const saveJsonEditor = useCallback(
    (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => {
      if (!jsonEditorState) return;
      void onSave(value, binaryMaps, jsonEditorState).then(() => {
        setJsonEditorState(null);
      });
    },
    [jsonEditorState, onSave],
  );

  return {
    jsonEditorState,
    openEditor,
    closeJsonEditor,
    saveJsonEditor,
  };
}
