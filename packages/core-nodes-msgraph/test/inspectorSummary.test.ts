/**
 * Unit tests for inspectorSummary() on built-in msgraph node definitions.
 * No engine / DI setup required — create the config class and call the method.
 */
import { describe, expect, it } from "vitest";

import { onNewMsGraphMailTrigger } from "../src/mail/onNewMailNode";
import { outlookMessageReplyNode } from "../src/mail/outlookMessageReplyNode";
import { outlookMessagePatchNode } from "../src/mail/outlookMessagePatchNode";
import { outlookMessageSendNode } from "../src/mail/outlookMessageSendNode";
import { outlookMessageGetNode } from "../src/mail/outlookMessageGetNode";
import { outlookAttachmentDownloadNode } from "../src/mail/outlookAttachmentDownloadNode";
import { outlookFolderResolveNode } from "../src/mail/outlookFolderResolveNode";
import { driveDownloadNode } from "../src/drive/driveDownloadNode";
import { driveUploadNode } from "../src/drive/driveUploadNode";
import { driveItemGetNode } from "../src/drive/driveItemGetNode";
import { driveListChildrenNode } from "../src/drive/driveListChildrenNode";
import { driveResolveNode } from "../src/drive/driveResolveNode";
import { driveCopyNode } from "../src/drive/driveCopyNode";
import { excelOpenWorkbookNode } from "../src/excel/excelOpenWorkbookNode";
import { excelReadRangeNode } from "../src/excel/excelReadRangeNode";
import { excelWriteRangeNode } from "../src/excel/excelWriteRangeNode";
import { excelAddSheetNode } from "../src/excel/excelAddSheetNode";
import { excelStyleRangeNode } from "../src/excel/excelStyleRangeNode";

// Helper: extract summary rows from a defineNode/definePollingTrigger created config.
function summary(
  node: { create(cfg: Record<string, unknown>): { inspectorSummary?(): unknown } },
  cfg: Record<string, unknown>,
) {
  const config = node.create(cfg as never);
  return config.inspectorSummary?.();
}

// ---------------------------------------------------------------------------
// onNewMsGraphMailTrigger
// ---------------------------------------------------------------------------

describe("onNewMsGraphMailTrigger inspectorSummary", () => {
  it("returns mailbox and folder rows", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "chris@example.com" } as never);
    const rows = config.inspectorSummary?.();
    expect(rows).toContainEqual({ label: "Mailbox", value: "chris@example.com" });
    expect(rows).toContainEqual({ label: "Folder", value: "inbox" });
  });

  it("includes poll interval row when set", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "me", pollIntervalMs: 120000 } as never);
    const rows = config.inspectorSummary?.();
    expect(rows).toContainEqual({ label: "Poll interval", value: "120s" });
  });

  it("includes downloadAttachments row when true", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "me", downloadAttachments: true } as never);
    const rows = config.inspectorSummary?.();
    expect(rows).toContainEqual({ label: "Download attachments", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// outlookMessageReplyNode
// ---------------------------------------------------------------------------

describe("outlookMessageReplyNode inspectorSummary", () => {
  it("returns mailbox, body type and action rows", () => {
    const rows = summary(outlookMessageReplyNode as never, { mailbox: "me", bodyType: "html" });
    expect(rows).toContainEqual({ label: "Mailbox", value: "me" });
    expect(rows).toContainEqual({ label: "Body type", value: "html" });
    expect(rows).toContainEqual({ label: "Action", value: "reply" });
  });

  it("sets action to forward when forward is true", () => {
    const rows = summary(outlookMessageReplyNode as never, {
      mailbox: "me",
      bodyType: "text",
      forward: true,
      to: ["a@b.com"],
    });
    expect(rows).toContainEqual({ label: "Action", value: "forward" });
  });

  it("sets action to reply-all when replyAll is true", () => {
    const rows = summary(outlookMessageReplyNode as never, { mailbox: "me", bodyType: "text", replyAll: true });
    expect(rows).toContainEqual({ label: "Action", value: "reply-all" });
  });

  it("includes draft-only row when set", () => {
    const rows = summary(outlookMessageReplyNode as never, { mailbox: "me", bodyType: "text", draftOnly: true });
    expect(rows).toContainEqual({ label: "Draft only", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// outlookMessagePatchNode
// ---------------------------------------------------------------------------

describe("outlookMessagePatchNode inspectorSummary", () => {
  it("returns mailbox row", () => {
    const rows = summary(outlookMessagePatchNode as never, { mailbox: "user@example.com" });
    expect(rows).toContainEqual({ label: "Mailbox", value: "user@example.com" });
  });

  it("includes categories row when set", () => {
    const rows = summary(outlookMessagePatchNode as never, { mailbox: "me", categories: ["Important", "Work"] });
    expect(rows).toContainEqual({ label: "Categories", value: "Important, Work" });
  });

  it("includes mark-as-read row", () => {
    const rows = summary(outlookMessagePatchNode as never, { mailbox: "me", isRead: true });
    expect(rows).toContainEqual({ label: "Mark as read", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// outlookMessageSendNode
// ---------------------------------------------------------------------------

describe("outlookMessageSendNode inspectorSummary", () => {
  it("returns mailbox and to rows", () => {
    const rows = summary(outlookMessageSendNode as never, {
      mailbox: "me",
      to: ["alice@example.com"],
      bodyType: "text",
    });
    expect(rows).toContainEqual({ label: "Mailbox", value: "me" });
    expect(rows).toContainEqual({ label: "To", value: "alice@example.com" });
  });

  it("includes draft-only when set", () => {
    const rows = summary(outlookMessageSendNode as never, {
      mailbox: "me",
      to: ["a@b.com"],
      bodyType: "text",
      draftOnly: true,
    });
    expect(rows).toContainEqual({ label: "Draft only", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// outlookMessageGetNode
// ---------------------------------------------------------------------------

describe("outlookMessageGetNode inspectorSummary", () => {
  it("returns mailbox row", () => {
    const rows = summary(outlookMessageGetNode as never, { mailbox: "me" });
    expect(rows).toContainEqual({ label: "Mailbox", value: "me" });
  });

  it("includes expand-attachments row when set", () => {
    const rows = summary(outlookMessageGetNode as never, { mailbox: "me", expandAttachments: true });
    expect(rows).toContainEqual({ label: "Expand attachments", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// outlookAttachmentDownloadNode
// ---------------------------------------------------------------------------

describe("outlookAttachmentDownloadNode inspectorSummary", () => {
  it("returns mailbox and binary slot rows", () => {
    const rows = summary(outlookAttachmentDownloadNode as never, { mailbox: "me", binarySlot: "file" });
    expect(rows).toContainEqual({ label: "Mailbox", value: "me" });
    expect(rows).toContainEqual({ label: "Binary slot", value: "file" });
  });

  it("includes size cap when set", () => {
    const rows = summary(outlookAttachmentDownloadNode as never, { mailbox: "me", sizeCapBytes: 10 * 1024 * 1024 });
    expect(rows).toContainEqual({ label: "Size cap", value: "10MiB" });
  });
});

// ---------------------------------------------------------------------------
// outlookFolderResolveNode
// ---------------------------------------------------------------------------

describe("outlookFolderResolveNode inspectorSummary", () => {
  it("returns mailbox and folder path rows", () => {
    const rows = summary(outlookFolderResolveNode as never, { mailbox: "me", folderPath: "inbox/subfolder" });
    expect(rows).toContainEqual({ label: "Mailbox", value: "me" });
    expect(rows).toContainEqual({ label: "Folder path", value: "inbox/subfolder" });
  });

  it("includes create-if-missing row when set", () => {
    const rows = summary(outlookFolderResolveNode as never, {
      mailbox: "me",
      folderPath: "inbox",
      createIfMissing: true,
    });
    expect(rows).toContainEqual({ label: "Create if missing", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// driveDownloadNode
// ---------------------------------------------------------------------------

describe("driveDownloadNode inspectorSummary", () => {
  it("returns drive ID and item ID rows", () => {
    const rows = summary(driveDownloadNode as never, { driveId: "drive-abc", itemId: "item-123" });
    expect(rows).toContainEqual({ label: "Drive ID", value: "drive-abc" });
    expect(rows).toContainEqual({ label: "Item ID", value: "item-123" });
  });
});

// ---------------------------------------------------------------------------
// driveUploadNode
// ---------------------------------------------------------------------------

describe("driveUploadNode inspectorSummary", () => {
  it("returns drive ID, parent item and binary slot rows", () => {
    const rows = summary(driveUploadNode as never, {
      driveId: "drive-xyz",
      parentItemId: "root",
      binarySlot: "document",
    });
    expect(rows).toContainEqual({ label: "Drive ID", value: "drive-xyz" });
    expect(rows).toContainEqual({ label: "Binary slot", value: "document" });
  });

  it("includes conflict behavior when set", () => {
    const rows = summary(driveUploadNode as never, {
      driveId: "d",
      parentItemId: "p",
      binarySlot: "b",
      conflictBehavior: "rename",
    });
    expect(rows).toContainEqual({ label: "On conflict", value: "rename" });
  });
});

// ---------------------------------------------------------------------------
// driveItemGetNode
// ---------------------------------------------------------------------------

describe("driveItemGetNode inspectorSummary", () => {
  it("returns drive ID and item ID", () => {
    const rows = summary(driveItemGetNode as never, { driveId: "d1", itemId: "i1" });
    expect(rows).toContainEqual({ label: "Drive ID", value: "d1" });
    expect(rows).toContainEqual({ label: "Item ID", value: "i1" });
  });

  it("includes expand row when set", () => {
    const rows = summary(driveItemGetNode as never, { driveId: "d1", itemId: "i1", expand: ["permissions"] });
    expect(rows).toContainEqual({ label: "Expand", value: "permissions" });
  });
});

// ---------------------------------------------------------------------------
// driveListChildrenNode
// ---------------------------------------------------------------------------

describe("driveListChildrenNode inspectorSummary", () => {
  it("returns drive ID and item ID", () => {
    const rows = summary(driveListChildrenNode as never, { driveId: "d1", itemId: "root" });
    expect(rows).toContainEqual({ label: "Drive ID", value: "d1" });
    expect(rows).toContainEqual({ label: "Item ID", value: "(root)" });
  });
});

// ---------------------------------------------------------------------------
// driveResolveNode
// ---------------------------------------------------------------------------

describe("driveResolveNode inspectorSummary", () => {
  it("returns kind and path for personalPath", () => {
    const rows = summary(driveResolveNode as never, {
      input: { kind: "personalPath", path: "/Documents/Report.xlsx" },
    });
    expect(rows).toContainEqual({ label: "Kind", value: "personalPath" });
    expect(rows).toContainEqual({ label: "Path", value: "/Documents/Report.xlsx" });
  });

  it("returns kind and url for sharedLink", () => {
    const rows = summary(driveResolveNode as never, { input: { kind: "sharedLink", url: "https://share.link/abc" } });
    expect(rows).toContainEqual({ label: "Kind", value: "sharedLink" });
    expect(rows).toContainEqual({ label: "URL", value: "https://share.link/abc" });
  });
});

// ---------------------------------------------------------------------------
// driveCopyNode
// ---------------------------------------------------------------------------

describe("driveCopyNode inspectorSummary", () => {
  it("returns source and target drive rows", () => {
    const rows = summary(driveCopyNode as never, {
      sourceDriveId: "src-drive",
      sourceItemId: "src-item",
      targetDriveId: "tgt-drive",
      targetParentItemId: "tgt-parent",
    });
    expect(rows).toContainEqual({ label: "Source drive", value: "src-drive" });
    expect(rows).toContainEqual({ label: "Target drive", value: "tgt-drive" });
  });

  it("includes new name when set", () => {
    const rows = summary(driveCopyNode as never, {
      sourceDriveId: "s",
      sourceItemId: "i",
      targetDriveId: "t",
      targetParentItemId: "p",
      name: "Copy of report.xlsx",
    });
    expect(rows).toContainEqual({ label: "New name", value: "Copy of report.xlsx" });
  });
});

// ---------------------------------------------------------------------------
// excelOpenWorkbookNode
// ---------------------------------------------------------------------------

describe("excelOpenWorkbookNode inspectorSummary", () => {
  it("returns drive ID, item ID and persist-changes rows", () => {
    const rows = summary(excelOpenWorkbookNode as never, { driveId: "drive-abc", itemId: "book-xyz" });
    expect(rows).toContainEqual({ label: "Drive ID", value: "drive-abc" });
    expect(rows).toContainEqual({ label: "Item ID", value: "book-xyz" });
    expect(rows).toContainEqual({ label: "Persist changes", value: "yes" });
  });

  it("shows no for persistChanges: false", () => {
    const rows = summary(excelOpenWorkbookNode as never, { driveId: "d", itemId: "i", persistChanges: false });
    expect(rows).toContainEqual({ label: "Persist changes", value: "no" });
  });
});

// ---------------------------------------------------------------------------
// excelReadRangeNode
// ---------------------------------------------------------------------------

describe("excelReadRangeNode inspectorSummary", () => {
  it("returns sheet and range rows", () => {
    const rows = summary(excelReadRangeNode as never, { sheet: "Sheet1", range: "A1:D10" });
    expect(rows).toContainEqual({ label: "Sheet", value: "Sheet1" });
    expect(rows).toContainEqual({ label: "Range", value: "A1:D10" });
  });

  it("defaults range to usedRange", () => {
    const rows = summary(excelReadRangeNode as never, { sheet: "Data" });
    expect(rows).toContainEqual({ label: "Range", value: "usedRange" });
  });
});

// ---------------------------------------------------------------------------
// excelWriteRangeNode
// ---------------------------------------------------------------------------

describe("excelWriteRangeNode inspectorSummary", () => {
  it("returns sheet and range rows", () => {
    const rows = summary(excelWriteRangeNode as never, { sheet: "Results", range: "A1" });
    expect(rows).toContainEqual({ label: "Sheet", value: "Results" });
    expect(rows).toContainEqual({ label: "Range", value: "A1" });
  });

  it("includes append-below row when set", () => {
    const rows = summary(excelWriteRangeNode as never, { sheet: "Data", appendBelow: true });
    expect(rows).toContainEqual({ label: "Append below", value: "yes" });
  });
});

// ---------------------------------------------------------------------------
// excelAddSheetNode
// ---------------------------------------------------------------------------

describe("excelAddSheetNode inspectorSummary", () => {
  it("returns sheet name row", () => {
    const rows = summary(excelAddSheetNode as never, { name: "Summary" });
    expect(rows).toContainEqual({ label: "Sheet name", value: "Summary" });
  });

  it("includes copy-from when set", () => {
    const rows = summary(excelAddSheetNode as never, { name: "Copy", copyFrom: { sheetName: "Template" } });
    expect(rows).toContainEqual({ label: "Copy from", value: "Template" });
  });
});

// ---------------------------------------------------------------------------
// excelStyleRangeNode
// ---------------------------------------------------------------------------

describe("excelStyleRangeNode inspectorSummary", () => {
  it("returns sheet and range rows", () => {
    const rows = summary(excelStyleRangeNode as never, { sheet: "Sheet1", range: "A1:Z1" });
    expect(rows).toContainEqual({ label: "Sheet", value: "Sheet1" });
    expect(rows).toContainEqual({ label: "Range", value: "A1:Z1" });
  });
});
