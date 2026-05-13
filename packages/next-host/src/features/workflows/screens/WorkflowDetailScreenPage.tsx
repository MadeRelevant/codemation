"use client";
import { useCallback, useMemo } from "react";
import { WorkflowDetailScreen } from "@codemation/canvas";
import type { NodeCredentialBindingsSlotProps, WorkflowCanvasConfig } from "@codemation/canvas";
import { NextHostApiClientAdapter } from "../canvas-adapter/NextHostApiClientAdapter";
import { useNextHostNavigationAdapter } from "../canvas-adapter/NextHostNavigationAdapter";
import { NextHostCredentialBindingsRenderer } from "../canvas-adapter/NextHostCredentialBindingsRenderer";
import { useWorkflowDetailChromeDispatch } from "../../../shell/WorkflowDetailChromeContext";

export function WorkflowDetailScreenPage(args: Readonly<{ workflowId: string }>) {
  const navigation = useNextHostNavigationAdapter();
  const apiClient = useMemo(() => new NextHostApiClientAdapter(), []);
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
