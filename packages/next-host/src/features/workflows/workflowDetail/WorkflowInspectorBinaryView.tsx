import { WorkflowInspectorAttachmentList } from "./WorkflowInspectorAttachmentList";
import type { WorkflowExecutionInspectorAttachmentModel } from "./workflowDetailTypes";

export function WorkflowInspectorBinaryView(args: Readonly<{ attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>; emptyLabel: string }>) {
  if (args.attachments.length === 0) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{args.emptyLabel}</div>;
  }
  return <WorkflowInspectorAttachmentList attachments={args.attachments} />;
}
