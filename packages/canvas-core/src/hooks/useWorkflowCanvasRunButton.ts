"use client";
import { useCallback, useMemo } from "react";
import type { WorkflowNodeDto } from "@codemation/host/dto";
import { useLastRunTrigger } from "./useLastRunTrigger";

interface UseWorkflowCanvasRunButtonArgs {
  readonly workflowId: string;
  readonly workflowNodes: ReadonlyArray<WorkflowNodeDto>;
  readonly isRunning: boolean;
  readonly onRunLiveTrigger: (nodeId: string) => void;
  readonly onRunTestTrigger: (nodeId: string) => void;
}

interface Trigger {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: "live" | "test";
}

export interface UseWorkflowCanvasRunButtonResult {
  readonly triggers: ReadonlyArray<Trigger>;
  readonly selectedTriggerNodeId: string | null;
  readonly isDisabled: boolean;
  readonly handleSelectTrigger: (nodeId: string) => void;
  readonly handleRunLiveTrigger: (nodeId: string) => void;
  readonly handleRunTestTrigger: (nodeId: string) => void;
}

/**
 * Hook for managing the split run button state and handlers.
 * Handles trigger persistence, default selection, and live/test trigger dispatch.
 */
export function useWorkflowCanvasRunButton(args: UseWorkflowCanvasRunButtonArgs): UseWorkflowCanvasRunButtonResult {
  const { workflowId, workflowNodes, isRunning, onRunLiveTrigger, onRunTestTrigger } = args;
  const [lastRunTriggerNodeId, setLastRunTriggerNodeId] = useLastRunTrigger(workflowId);

  // Compute triggers for the run button
  const triggers = useMemo(() => {
    return workflowNodes
      .filter((n) => n.kind === "trigger")
      .map((n) => ({
        nodeId: n.id,
        name: n.name ?? n.id,
        kind: (n.triggerKind ?? "live") as "live" | "test",
      }));
  }, [workflowNodes]);

  const handleSelectTrigger = useCallback(
    (nodeId: string) => {
      setLastRunTriggerNodeId(nodeId);
    },
    [setLastRunTriggerNodeId],
  );

  const handleRunLiveTrigger = useCallback(
    (nodeId: string) => {
      handleSelectTrigger(nodeId);
      onRunLiveTrigger(nodeId);
    },
    [handleSelectTrigger, onRunLiveTrigger],
  );

  const handleRunTestTrigger = useCallback(
    (nodeId: string) => {
      handleSelectTrigger(nodeId);
      onRunTestTrigger(nodeId);
    },
    [handleSelectTrigger, onRunTestTrigger],
  );

  return {
    triggers,
    selectedTriggerNodeId: lastRunTriggerNodeId,
    isDisabled: triggers.length === 0 || isRunning,
    handleSelectTrigger,
    handleRunLiveTrigger,
    handleRunTestTrigger,
  };
}
