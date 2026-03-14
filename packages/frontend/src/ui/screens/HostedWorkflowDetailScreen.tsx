import { Component, type ReactNode } from "react";
import { WorkflowDetailScreen } from "./WorkflowDetailScreen";

export interface HostedWorkflowDetailScreenProps {
  readonly workflowId: string;
}

export class HostedWorkflowDetailScreen extends Component<HostedWorkflowDetailScreenProps> {
  render(): ReactNode {
    return <WorkflowDetailScreen workflowId={this.props.workflowId} />;
  }
}
