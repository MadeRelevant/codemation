"use client";
import { useCallback, useMemo } from "react";
import { WorkflowDetailScreen, createWorkflowCanvasApiClient } from "@codemation/canvas";
import type { NodeCredentialBindingsSlotProps, WorkflowCanvasConfig } from "@codemation/canvas";
import { useNextHostNavigationAdapter } from "../canvas-adapter/NextHostNavigationAdapter";
import { NextHostCredentialBindingsRenderer } from "../canvas-adapter/NextHostCredentialBindingsRenderer";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreenPage(args: Readonly<{ workflowId: string }>) {
  const navigation = useNextHostNavigationAdapter();
  const apiClient = useMemo(() => createWorkflowCanvasApiClient({ apiBase: "", getToken: () => null }), []);
  const setChrome = useWorkflowDetailChromeDispatch();
  const renderCredentialBindings = useCallback(
    (props: NodeCredentialBindingsSlotProps) => <NextHostCredentialBindingsRenderer {...props} />,
    [],
  );
  const config = useMemo((): WorkflowCanvasConfig => ({ renderCredentialBindings }), [renderCredentialBindings]);
  return (
    <WorkflowDetailScreen
      workflowId={args.workflowId}
      apiClient={apiClient}
      navigation={navigation}
      onChromeChange={setChrome ?? undefined}
      config={config}
    />
  );
}
