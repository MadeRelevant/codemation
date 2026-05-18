"use client";

import type { WorkflowDetailHeaderSlotContext } from "@codemation/canvas-core";

/**
 * Default header slot — the current WorkflowDetailScreen has no top header/breadcrumb area,
 * so this renders nothing. Exists as a placeholder for the slot system.
 */
export function DefaultHeader(_props: Readonly<{ ctx: WorkflowDetailHeaderSlotContext }>) {
  return null;
}
