"use client";

import { Component, type ReactNode } from "react";
import { WorkflowDetailScreen } from "@codemation/frontend/next/client";

export interface HostedWorkflowDetailPageProps {
  readonly workflowId: string;
}

export class HostedWorkflowDetailPage extends Component<HostedWorkflowDetailPageProps> {
  render(): ReactNode {
    return <WorkflowDetailScreen workflowId={this.props.workflowId} />;
  }
}
