"use client";

import { useEffect, useMemo, useRef } from "react";

import type { WorkflowDetailControllerResult, WorkflowDetailChromeState } from "@codemation/canvas-core";

export function useWorkflowDetailChromeSync(
  controller: WorkflowDetailControllerResult,
  onChromeChange: ((state: WorkflowDetailChromeState | null) => void) | undefined,
): void {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const chromeStateKey = useMemo(
    () =>
      [
        controller.isLiveWorkflowView,
        controller.workflowIsActive,
        controller.isWorkflowActivationPending,
        (controller.workflowActivationAlertLines ?? []).join(" "),
        controller.credentialAttentionSummaryLines.join(" "),
      ].join("|"),
    [
      controller.isLiveWorkflowView,
      controller.workflowIsActive,
      controller.isWorkflowActivationPending,
      controller.workflowActivationAlertLines,
      controller.credentialAttentionSummaryLines,
    ],
  );

  useEffect(() => {
    if (!onChromeChange) return;
    const c = controllerRef.current;
    onChromeChange({
      isLiveWorkflowView: c.isLiveWorkflowView,
      workflowIsActive: c.workflowIsActive,
      isWorkflowActivationPending: c.isWorkflowActivationPending,
      setWorkflowActive: (active) => controllerRef.current.setWorkflowActive(active),
      workflowActivationAlertLines: c.workflowActivationAlertLines,
      dismissWorkflowActivationAlert: () => controllerRef.current.dismissWorkflowActivationAlert(),
      credentialAttentionSummaryLines: c.credentialAttentionSummaryLines,
    });
  }, [onChromeChange, chromeStateKey]);

  useEffect(() => {
    return () => {
      onChromeChange?.(null);
    };
  }, [onChromeChange]);
}
