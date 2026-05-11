"use client";
import { useMemo } from "react";
import type { WorkflowDetailChromeState } from "@codemation/canvas";
import { WorkflowDetailScreen } from "@codemation/canvas";
import { NextHostApiClientAdapter } from "../canvas-adapter/NextHostApiClientAdapter";
import { useNextHostNavigationAdapter } from "../canvas-adapter/NextHostNavigationAdapter";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreenPage(args: Readonly<{ workflowId: string }>) {
  const navigation = useNextHostNavigationAdapter();
  const apiClient = useMemo(() => new NextHostApiClientAdapter(), []);
  const setChrome = useWorkflowDetailChromeDispatch();
  const handleChromeChange = useMemo(
    () => (setChrome ? (state: WorkflowDetailChromeState | null) => setChrome(state) : undefined),
    [setChrome],
  );
  return (
    <WorkflowDetailScreen
      workflowId={args.workflowId}
      apiClient={apiClient}
      navigation={navigation}
      onChromeChange={handleChromeChange}
    />
  );
}
