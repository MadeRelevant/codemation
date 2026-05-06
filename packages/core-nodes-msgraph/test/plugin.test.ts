import { describe, expect, it } from "vitest";
import {
  msGraphMailOAuthCredentialType,
  MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID,
  msGraphDriveOAuthCredentialType,
  MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID,
  onNewMsGraphMailTrigger,
  outlookMessageGetNode,
  outlookMessageReplyNode,
  outlookMessageSendNode,
  outlookMessagePatchNode,
  outlookFolderResolveNode,
  driveResolveNode,
  driveListChildrenNode,
  driveItemGetNode,
  driveDownloadNode,
  driveUploadNode,
  driveCopyNode,
  driveListMyDrivesNode,
  driveListSharedWithMeNode,
  excelOpenWorkbookNode,
  excelCloseWorkbookNode,
  excelListWorksheetsNode,
  excelReadRangeNode,
  excelWriteRangeNode,
  excelAddSheetNode,
  excelStyleRangeNode,
} from "../src/index";

const ALL_NODES = [
  onNewMsGraphMailTrigger,
  outlookMessageGetNode,
  outlookMessageReplyNode,
  outlookMessageSendNode,
  outlookMessagePatchNode,
  outlookFolderResolveNode,
  driveResolveNode,
  driveListChildrenNode,
  driveItemGetNode,
  driveDownloadNode,
  driveUploadNode,
  driveCopyNode,
  driveListMyDrivesNode,
  driveListSharedWithMeNode,
  excelOpenWorkbookNode,
  excelCloseWorkbookNode,
  excelListWorksheetsNode,
  excelReadRangeNode,
  excelWriteRangeNode,
  excelAddSheetNode,
  excelStyleRangeNode,
] as const;

describe("core-nodes-msgraph plugin", () => {
  it("exports exactly 21 nodes with unique keys", () => {
    expect(ALL_NODES).toHaveLength(21);
    const keys = ALL_NODES.map((n) => n.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(21);
  });

  it("credential type ids are correct", () => {
    expect(MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID).toBe("msgraph-mail-oauth");
    expect(MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID).toBe("msgraph-drive-oauth");
  });

  it("credential types expose both expected type ids", () => {
    expect(msGraphMailOAuthCredentialType.definition.typeId).toBe("msgraph-mail-oauth");
    expect(msGraphDriveOAuthCredentialType.definition.typeId).toBe("msgraph-drive-oauth");
  });

  it("credential types are built with defineCredential (have a .key property)", () => {
    expect(msGraphMailOAuthCredentialType.key).toBe("msgraph-mail-oauth");
    expect(msGraphDriveOAuthCredentialType.key).toBe("msgraph-drive-oauth");
  });
});
