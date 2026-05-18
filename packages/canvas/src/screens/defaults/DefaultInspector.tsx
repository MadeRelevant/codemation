"use client";

import type { WorkflowDetailInspectorSlotContext } from "@codemation/canvas-core";
import { WorkflowDetailScreenInspectorPanel } from "../WorkflowDetailScreenInspectorPanel";

/**
 * Default inspector slot — renders the bottom panel inspector using inspect controller fields,
 * exactly as WorkflowDetailScreen does today.
 */
export function DefaultInspector(props: Readonly<{ ctx: WorkflowDetailInspectorSlotContext }>) {
  return <WorkflowDetailScreenInspectorPanel controller={props.ctx.inspect} />;
}
