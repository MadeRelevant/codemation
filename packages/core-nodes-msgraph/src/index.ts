export { msGraphOAuthCredentialType } from "./credentials/msGraphOAuth";
export type { MsGraphSession } from "./credentials/session";
export { OnNewMsGraphMailTrigger } from "./mail/onNewMailConfig";
export type { OnNewMsGraphMailOptions } from "./mail/onNewMailConfig";
export type { MsGraphMailItem, MsGraphMailTriggerState, MsGraphMailAddress, MsGraphMailAttachment } from "./mail/types";

// --- PR A: Outlook mail nodes ---
export { OutlookMessageGet } from "./mail/outlookMessageGetNode";
export type { OutlookMessageGetOptions } from "./mail/outlookMessageGetNode";

export { OutlookMessageReply } from "./mail/outlookMessageReplyNode";
export type {
  OutlookMessageReplyOptions,
  OutlookMessageReplyOutput,
  BinaryRef,
  InlineBinaryRef,
} from "./mail/outlookMessageReplyNode";

export { OutlookMessageSend } from "./mail/outlookMessageSendNode";
export type { OutlookMessageSendOptions, OutlookMessageSendOutput } from "./mail/outlookMessageSendNode";

export { OutlookMessagePatch } from "./mail/outlookMessagePatchNode";
export type { OutlookMessagePatchOptions, OutlookMessagePatchOutput } from "./mail/outlookMessagePatchNode";

export { OutlookFolderResolve } from "./mail/outlookFolderResolveNode";
export type { OutlookFolderResolveOptions, OutlookFolderResolveOutput } from "./mail/outlookFolderResolveNode";

// --- PR B1: Drive resolve node ---
export { DriveResolve } from "./drive/driveResolveNode";
export { DriveResolveInputSchema } from "./drive/driveResolveNode";
export type { DriveResolveInput, DriveResolveOptions, DriveResolveOutput } from "./drive/driveResolveNode";

// --- PR B2–B5: Drive list/get/download/upload nodes ---
export { DriveListChildren, DriveListChildrenInputSchema } from "./drive/driveListChildrenNode";
export type {
  DriveListChildrenOptions,
  DriveListChildrenInput,
  DriveListChildrenOutput,
} from "./drive/driveListChildrenNode";

export { DriveItemGet, DriveItemGetInputSchema } from "./drive/driveItemGetNode";
export type { DriveItemGetOptions, DriveItemGetInput } from "./drive/driveItemGetNode";

export { DriveDownload, DriveDownloadInputSchema } from "./drive/driveDownloadNode";
export type { DriveDownloadOptions, DriveDownloadInput, DriveDownloadOutput } from "./drive/driveDownloadNode";

export { DriveUpload, DriveUploadInputSchema } from "./drive/driveUploadNode";
export type { DriveUploadOptions, DriveUploadInput, DriveUploadOutput } from "./drive/driveUploadNode";

// --- PR B6–B7: Drive copy + enumeration ---
export { DriveCopy, DriveCopyInputSchema } from "./drive/driveCopyNode";
export type {
  DriveCopyOptions,
  DriveCopyInput,
  DriveCopyOutput,
  DriveCopyPendingOutput,
  DriveCopyCompletedOutput,
} from "./drive/driveCopyNode";

export { DriveListMyDrives } from "./drive/driveListMyDrivesNode";
export type { DriveListMyDrivesOptions, DriveListMyDrivesOutput, DriveInfo } from "./drive/driveListMyDrivesNode";

export { DriveListSharedWithMe } from "./drive/driveListSharedWithMeNode";
export type {
  DriveListSharedWithMeOptions,
  DriveListSharedWithMeOutput,
  SharedWithMeItem,
} from "./drive/driveListSharedWithMeNode";

// Shared mapper types
export type { DriveChildItem, DriveItemFull } from "./drive/driveItemMapper";

// --- PR C0+C1: Excel session open/close ---
export type { WorkbookHandle } from "./excel/session";

export { ExcelOpenWorkbook } from "./excel/excelOpenWorkbookNode";
export type { ExcelOpenWorkbookOptions, ExcelOpenWorkbookOutput } from "./excel/excelOpenWorkbookNode";

export { ExcelCloseWorkbook } from "./excel/excelCloseWorkbookNode";
export type { ExcelCloseWorkbookOptions, ExcelCloseWorkbookOutput } from "./excel/excelCloseWorkbookNode";

// --- PR C2–C6: Excel workbook nodes ---
export { ExcelListWorksheets } from "./excel/excelListWorksheetsNode";
export type {
  ExcelListWorksheetsOptions,
  ExcelListWorksheetsOutput,
  WorksheetInfo,
} from "./excel/excelListWorksheetsNode";

export { ExcelReadRange } from "./excel/excelReadRangeNode";
export { excelSerialToIso } from "./excel/excelReadRangeNode";
export type { ExcelReadRangeOptions, ExcelReadRangeOutput } from "./excel/excelReadRangeNode";

export { ExcelWriteRange } from "./excel/excelWriteRangeNode";
export type { ExcelWriteRangeOptions, ExcelWriteRangeOutput } from "./excel/excelWriteRangeNode";

export { ExcelAddSheet } from "./excel/excelAddSheetNode";
export type { ExcelAddSheetOptions, ExcelAddSheetOutput, WorksheetDetails } from "./excel/excelAddSheetNode";

export { ExcelStyleRange } from "./excel/excelStyleRangeNode";
export type { ExcelStyleRangeOptions, ExcelStyleRangeOutput } from "./excel/excelStyleRangeNode";
