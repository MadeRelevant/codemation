import type { WorkflowExecutionInspectorAttachmentModel,WorkflowInspectorAttachmentGroup } from "./workflowDetailTypes";

export class WorkflowInspectorAttachmentGroupingPresenter {
  static buildGroups(
    attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>,
  ): Readonly<{
    groups: ReadonlyArray<WorkflowInspectorAttachmentGroup>;
    shouldShowGroupHeadings: boolean;
  }> {
    const groupsByItemIndex = new Map<number, WorkflowExecutionInspectorAttachmentModel[]>();
    for (const attachment of attachments) {
      const existingGroup = groupsByItemIndex.get(attachment.itemIndex);
      if (existingGroup) {
        existingGroup.push(attachment);
        continue;
      }
      groupsByItemIndex.set(attachment.itemIndex, [attachment]);
    }
    const groups = [...groupsByItemIndex.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .map(([itemIndex, itemAttachments]) => ({
        itemIndex,
        attachments: itemAttachments,
      }));
    return {
      groups,
      shouldShowGroupHeadings: groups.length > 1,
    };
  }
}
