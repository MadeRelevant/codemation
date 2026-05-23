"use client";

import React from "react";

import type { JsonEditorState, PinBinaryMapsByItemIndex, WorkflowJsonEditorSlotProps } from "@codemation/canvas-core";

import { WorkflowJsonEditorDialog } from "../panels/WorkflowJsonEditorDialog";

/** Mounts the JSON editor: either the consumer override or the built-in dialog. */
export function WorkflowJsonEditorMount(
  args: Readonly<{
    state: JsonEditorState;
    onClose: () => void;
    onSave: (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => void;
    renderOverride?: (props: WorkflowJsonEditorSlotProps) => React.ReactNode;
  }>,
) {
  const slotProps: WorkflowJsonEditorSlotProps = {
    state: args.state,
    onClose: args.onClose,
    onSave: args.onSave,
  };
  if (args.renderOverride) {
    return <>{args.renderOverride(slotProps)}</>;
  }
  return <WorkflowJsonEditorDialog {...slotProps} />;
}
