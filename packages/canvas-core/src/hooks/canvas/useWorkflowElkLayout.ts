"use client";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowDto } from "@codemation/host/dto";
import { computeWorkflowPositionedLayout } from "../../canvas-lib/layoutWorkflow";
import type { WorkflowPositionedLayout } from "../../canvas-lib/elk/WorkflowPositionedLayout.types";
import type { WorkflowCanvasConfig } from "../../types/WorkflowCanvasConfig";

/**
 * Runs the async ELK layout pipeline whenever the workflow's *structure
 * signature* (or the optional node-role filter) changes — NOT on every
 * snapshot/status event. The synchronous React Flow overlay in
 * `useAsyncWorkflowLayout` re-uses the returned layout across realtime
 * bursts so per-event re-renders no longer pay for a full ELK pass.
 *
 * Returns `null` until the first layout resolves; consumers gate viewport-fit
 * on that.
 */
export function useWorkflowElkLayout(
  workflow: WorkflowDto,
  config?: WorkflowCanvasConfig,
): WorkflowPositionedLayout | null {
  const structureSignature = useMemo(() => JSON.stringify(workflow), [workflow]);
  const nodeRoleFilter = config?.nodeRoleFilter;
  // Re-running ELK is gated on the structural signature (positions only
  // depend on workflow shape + role filter). The `workflow` ref itself is
  // not in deps on purpose: query refetches that return identical data would
  // otherwise trigger redundant ELK passes. The latest workflow object is
  // captured via a ref so the effect always reads the current value.
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const [layout, setLayout] = useState<WorkflowPositionedLayout | null>(null);
  useEffect(() => {
    let cancelled = false;
    void computeWorkflowPositionedLayout(workflowRef.current, nodeRoleFilter ? { nodeRoleFilter } : undefined).then(
      (resolved) => {
        if (cancelled) return;
        setLayout(resolved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [structureSignature, nodeRoleFilter]);
  return layout;
}
