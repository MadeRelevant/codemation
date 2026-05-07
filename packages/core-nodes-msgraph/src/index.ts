export { msGraphMailOAuthCredentialType, MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "./credentials/msGraphMailOAuth";
export {
  msGraphDriveOAuthCredentialType,
  MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID,
} from "./credentials/msGraphDriveOAuth";
export type { MsGraphSession } from "./credentials/session";
// Escape hatch: workflow authors can call this inside a Callback (or any custom node)
// after `ctx.getCredential<MsGraphSession>("auth")` to get a fully-authenticated Graph SDK
// client when no built-in node covers their case. Pair with either credential type id —
// the runtime contract is the same; only granted scopes differ.
export { createGraphClient } from "./credentials/session";

// Mail trigger
export { onNewMsGraphMailTrigger } from "./mail/onNewMailNode";
export type { OnNewMsGraphMailOptions } from "./mail/onNewMailConfig";
export type { MsGraphMailItem, MsGraphMailTriggerState, MsGraphMailAddress, MsGraphMailAttachment } from "./mail/types";

// Mail nodes
export { outlookMessageGetNode } from "./mail/outlookMessageGetNode";
export type { OutlookMessageGetOptions } from "./mail/outlookMessageGetNode";

export { outlookAttachmentDownloadNode } from "./mail/outlookAttachmentDownloadNode";
export type {
  OutlookAttachmentDownloadOptions,
  OutlookAttachmentDownloadOutput,
  OutlookAttachmentDownloadInput,
} from "./mail/outlookAttachmentDownloadNode";

export { outlookMessageReplyNode } from "./mail/outlookMessageReplyNode";
export type {
  OutlookMessageReplyOptions,
  OutlookMessageReplyOutput,
  BinaryRef,
  InlineBinaryRef,
} from "./mail/outlookMessageReplyNode";

export { outlookMessageSendNode } from "./mail/outlookMessageSendNode";
export type { OutlookMessageSendOptions, OutlookMessageSendOutput } from "./mail/outlookMessageSendNode";

export { outlookMessagePatchNode } from "./mail/outlookMessagePatchNode";
export type { OutlookMessagePatchOptions, OutlookMessagePatchOutput } from "./mail/outlookMessagePatchNode";

export { outlookFolderResolveNode } from "./mail/outlookFolderResolveNode";
export type { OutlookFolderResolveOptions, OutlookFolderResolveOutput } from "./mail/outlookFolderResolveNode";

// Drive nodes
export { driveResolveNode } from "./drive/driveResolveNode";
export { DriveResolveInputSchema } from "./drive/driveResolveNode";
export type { DriveResolveInput, DriveResolveOutput } from "./drive/driveResolveNode";

export { driveListChildrenNode, DriveListChildrenInputSchema } from "./drive/driveListChildrenNode";
export type { DriveListChildrenOptions, DriveListChildrenInput } from "./drive/driveListChildrenNode";

export { driveItemGetNode, DriveItemGetInputSchema } from "./drive/driveItemGetNode";
export type { DriveItemGetOptions, DriveItemGetInput } from "./drive/driveItemGetNode";

export { driveDownloadNode, DriveDownloadInputSchema } from "./drive/driveDownloadNode";
export type {
  DriveDownloadOptions,
  DriveDownloadInput,
  DriveDownloadOutput,
  DownloadHttp,
} from "./drive/driveDownloadNode";
export { makeProductionDownloadHttp } from "./drive/driveDownloadNode";

export { driveUploadNode, DriveUploadInputSchema } from "./drive/driveUploadNode";
export type { DriveUploadOptions, DriveUploadInput, DriveUploadOutput, UploadHttp } from "./drive/driveUploadNode";
export { makeProductionUploadHttp } from "./drive/driveUploadNode";

export { driveCopyNode, DriveCopyInputSchema } from "./drive/driveCopyNode";
export type {
  DriveCopyOptions,
  DriveCopyInput,
  DriveCopyOutput,
  DriveCopyPendingOutput,
  DriveCopyCompletedOutput,
  CopyHttp,
} from "./drive/driveCopyNode";
export { makeProductionCopyHttp } from "./drive/driveCopyNode";

export { driveListMyDrivesNode } from "./drive/driveListMyDrivesNode";
export type { DriveInfo } from "./drive/driveListMyDrivesNode";

export { driveListSharedWithMeNode } from "./drive/driveListSharedWithMeNode";
export type { SharedWithMeItem } from "./drive/driveListSharedWithMeNode";

// Shared mapper types
export type { DriveChildItem, DriveItemFull } from "./drive/driveItemMapper";

// Excel nodes
export type { WorkbookHandle } from "./excel/session";

export { excelOpenWorkbookNode } from "./excel/excelOpenWorkbookNode";
export type { ExcelOpenWorkbookOptions, ExcelOpenWorkbookOutput } from "./excel/excelOpenWorkbookNode";

export { excelCloseWorkbookNode } from "./excel/excelCloseWorkbookNode";
export type { ExcelCloseWorkbookOptions, ExcelCloseWorkbookOutput } from "./excel/excelCloseWorkbookNode";

export { excelListWorksheetsNode } from "./excel/excelListWorksheetsNode";
export type {
  ExcelListWorksheetsOptions,
  WorksheetInfo,
  WorksheetInfoWithHandle,
} from "./excel/excelListWorksheetsNode";

export { excelReadRangeNode } from "./excel/excelReadRangeNode";
export { excelSerialToIso } from "./excel/excelReadRangeNode";
export type { ExcelReadRangeOptions, ExcelReadRangeOutput } from "./excel/excelReadRangeNode";

export { excelWriteRangeNode } from "./excel/excelWriteRangeNode";
export type { ExcelWriteRangeOptions, ExcelWriteRangeOutput } from "./excel/excelWriteRangeNode";

export { excelAddSheetNode } from "./excel/excelAddSheetNode";
export type { ExcelAddSheetOptions, ExcelAddSheetOutput, WorksheetDetails } from "./excel/excelAddSheetNode";

export { excelStyleRangeNode } from "./excel/excelStyleRangeNode";
export type { ExcelStyleRangeOptions, ExcelStyleRangeOutput } from "./excel/excelStyleRangeNode";

// Pure helpers for testing
export { uploadItem } from "./drive/driveUploadNode";
export { downloadItem } from "./drive/driveDownloadNode";
export { copyItem } from "./drive/driveCopyNode";
export { runCycle, attachAttachmentBinaries } from "./mail/onNewMailNode";

// Exported pure helpers for mail node testing
export { fetchMessage } from "./mail/outlookMessageGetNode";
export { downloadAttachment } from "./mail/outlookAttachmentDownloadNode";
export { patchMessage } from "./mail/outlookMessagePatchNode";
export { sendMessage } from "./mail/outlookMessageSendNode";
export { replyToMessage } from "./mail/outlookMessageReplyNode";
export { resolveFolderPath } from "./mail/outlookFolderResolveNode";

// Exported pure helpers for excel node testing
export { executeExcelOpenWorkbook } from "./excel/excelOpenWorkbookNode";
export { executeExcelCloseWorkbook } from "./excel/excelCloseWorkbookNode";
export { executeExcelListWorksheets } from "./excel/excelListWorksheetsNode";
export { executeExcelReadRange } from "./excel/excelReadRangeNode";
export { executeExcelWriteRange } from "./excel/excelWriteRangeNode";
export { executeExcelAddSheet } from "./excel/excelAddSheetNode";
export { executeExcelStyleRange } from "./excel/excelStyleRangeNode";
