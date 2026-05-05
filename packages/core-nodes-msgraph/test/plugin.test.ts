import { describe, expect, it, vi } from "vitest";
import { register } from "../src/plugin";

describe("register", () => {
  it("registers the msgraph oauth credential type and all nodes", () => {
    const registerCredentialType = vi.fn();
    const registerNode = vi.fn();
    const ctx = { registerCredentialType, registerNode } as unknown as Parameters<typeof register>[0];

    register(ctx);

    expect(registerCredentialType).toHaveBeenCalledTimes(1);
    // PR 0: OnNewMsGraphMailTriggerNode
    // PR A: OutlookMessageGetNode, OutlookMessageReplyNode, OutlookMessageSendNode,
    //        OutlookMessagePatchNode, OutlookFolderResolveNode
    // PR B1: DriveResolveNode
    // PR B2–B5: DriveListChildrenNode, DriveItemGetNode, DriveDownloadNode, DriveUploadNode
    // PR B6–B7: DriveCopyNode, DriveListMyDrivesNode, DriveListSharedWithMeNode
    // PR C0+C1: ExcelOpenWorkbookNode, ExcelCloseWorkbookNode
    // PR C2–C6: ExcelListWorksheetsNode, ExcelReadRangeNode, ExcelWriteRangeNode,
    //            ExcelAddSheetNode, ExcelStyleRangeNode
    expect(registerNode).toHaveBeenCalledTimes(21);
  });
});
