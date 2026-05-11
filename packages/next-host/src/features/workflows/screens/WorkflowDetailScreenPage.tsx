"use client";
import { useMemo } from "react";
import { WorkflowDetailScreen } from "@codemation/canvas";
import { NextHostApiClientAdapter } from "../canvas-adapter/NextHostApiClientAdapter";
import { useNextHostNavigationAdapter } from "../canvas-adapter/NextHostNavigationAdapter";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreenPage(args: Readonly<{ workflowId: string }>) {
  const navigation = useNextHostNavigationAdapter();
  const apiClient = useMemo(() => new NextHostApiClientAdapter(), []);
  const setChrome = useWorkflowDetailChromeDispatch();
  return (
    <WorkflowDetailScreen
      workflowId={args.workflowId}
      apiClient={apiClient}
      navigation={navigation}
      onChromeChange={setChrome ?? undefined}
    />
  );
}
