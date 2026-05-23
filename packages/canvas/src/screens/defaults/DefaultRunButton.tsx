"use client";

import type { WorkflowDetailRunButtonSlotContext } from "@codemation/canvas-core";
import { WorkflowCanvasRunButton } from "../../panels/WorkflowCanvasRunButton";

/**
 * Default run button slot — renders the absolutely-positioned run button with trigger picker,
 * exactly as WorkflowDetailScreen does today.
 */
export function DefaultRunButton(props: Readonly<{ ctx: WorkflowDetailRunButtonSlotContext; isRunning: boolean }>) {
  const { run } = props.ctx;
  return (
    <WorkflowCanvasRunButton
      triggers={run.triggers}
      selectedTriggerNodeId={run.selectedTriggerNodeId}
      isRunning={props.isRunning}
      disabled={run.isDisabled}
      onSelect={run.handleSelectTrigger}
      onRunLive={run.handleRunLiveTrigger}
      onRunTest={run.handleRunTestTrigger}
    />
  );
}
