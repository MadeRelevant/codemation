// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { WorkflowInspectorAttachmentGroupingPresenter } from "../../src/panels/WorkflowInspectorAttachmentGroupingPresenter";
import type { WorkflowExecutionInspectorAttachmentModel } from "@codemation/canvas";

function makeAttachment(itemIndex: number, id: string): WorkflowExecutionInspectorAttachmentModel {
  return {
    itemIndex,
    id,
    filename: `file-${id}`,
    mimeType: "application/octet-stream",
    size: 100,
    pinId: `pin-${id}`,
    nodeId: "node-1",
  };
}

describe("WorkflowInspectorAttachmentGroupingPresenter.buildGroups", () => {
  it("returns empty groups for empty attachments", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([]);
    expect(result.groups).toEqual([]);
    expect(result.shouldShowGroupHeadings).toBe(false);
  });

  it("single attachment: one group, shouldShowGroupHeadings false", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([makeAttachment(0, "a")]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.itemIndex).toBe(0);
    expect(result.groups[0]!.attachments).toHaveLength(1);
    expect(result.shouldShowGroupHeadings).toBe(false);
  });

  it("two attachments with same itemIndex: one group", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([
      makeAttachment(0, "a"),
      makeAttachment(0, "b"),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.attachments).toHaveLength(2);
    expect(result.shouldShowGroupHeadings).toBe(false);
  });

  it("attachments with different itemIndexes: separate groups, shouldShowGroupHeadings true", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([
      makeAttachment(0, "a"),
      makeAttachment(1, "b"),
    ]);
    expect(result.groups).toHaveLength(2);
    expect(result.shouldShowGroupHeadings).toBe(true);
  });

  it("groups are sorted by itemIndex ascending", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([
      makeAttachment(2, "c"),
      makeAttachment(0, "a"),
      makeAttachment(1, "b"),
    ]);
    expect(result.groups.map((g) => g.itemIndex)).toEqual([0, 1, 2]);
  });

  it("mixed: some share itemIndex, some are unique", () => {
    const result = WorkflowInspectorAttachmentGroupingPresenter.buildGroups([
      makeAttachment(0, "a"),
      makeAttachment(0, "b"),
      makeAttachment(1, "c"),
    ]);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.attachments).toHaveLength(2);
    expect(result.groups[1]!.attachments).toHaveLength(1);
    expect(result.shouldShowGroupHeadings).toBe(true);
  });
});
