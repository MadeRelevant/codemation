"use client";

import type { ReactNode } from "react";

import { useWorkflowCanvasConfig } from "@codemation/canvas-core";
import type { WorkflowDiagramNode } from "@codemation/canvas";
import { CredentialUiNotConfiguredFallback } from "./CredentialUiNotConfiguredFallback";

export function NodeCredentialBindingsSection(
  args: Readonly<{
    workflowId: string;
    node: WorkflowDiagramNode;
    pendingCredentialEditForNodeId: string | null;
    onConsumedPendingCredentialEdit: () => void;
  }>,
): ReactNode {
  const config = useWorkflowCanvasConfig();
  if (!config?.renderCredentialBindings) {
    return <CredentialUiNotConfiguredFallback />;
  }
  return config.renderCredentialBindings(args);
}
