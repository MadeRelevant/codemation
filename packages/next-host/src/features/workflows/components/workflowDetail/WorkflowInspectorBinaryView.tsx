import { WorkflowInspectorAttachmentList } from "./WorkflowInspectorAttachmentList";
import type { WorkflowExecutionInspectorAttachmentModel } from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowInspectorBinaryView(args: Readonly<{ attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>; emptyLabel: string }>) {
  if (args.attachments.length === 0) {
    return (
      <div data-testid="workflow-inspector-empty-state" className="text-sm text-muted-foreground opacity-80">
        {args.emptyLabel}
      </div>
    );
  }
  return <WorkflowInspectorAttachmentList attachments={args.attachments} />;
}
