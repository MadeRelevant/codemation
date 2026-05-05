import type { CodemationPluginContext } from "@codemation/host";
import { msGraphDriveOAuthCredentialType } from "./credentials/msGraphDriveOAuth";
import { msGraphMailOAuthCredentialType } from "./credentials/msGraphMailOAuth";
import { DriveCopyNode } from "./drive/driveCopyNode";
import { DriveDownloadNode } from "./drive/driveDownloadNode";
import { DriveItemGetNode } from "./drive/driveItemGetNode";
import { DriveListChildrenNode } from "./drive/driveListChildrenNode";
import { DriveListMyDrivesNode } from "./drive/driveListMyDrivesNode";
import { DriveListSharedWithMeNode } from "./drive/driveListSharedWithMeNode";
import { DriveResolveNode } from "./drive/driveResolveNode";
import { DriveUploadNode } from "./drive/driveUploadNode";
import { ExcelCloseWorkbookNode } from "./excel/excelCloseWorkbookNode";
import { ExcelOpenWorkbookNode } from "./excel/excelOpenWorkbookNode";
import { ExcelListWorksheetsNode } from "./excel/excelListWorksheetsNode";
import { ExcelReadRangeNode } from "./excel/excelReadRangeNode";
import { ExcelWriteRangeNode } from "./excel/excelWriteRangeNode";
import { ExcelAddSheetNode } from "./excel/excelAddSheetNode";
import { ExcelStyleRangeNode } from "./excel/excelStyleRangeNode";
import { OutlookFolderResolveNode } from "./mail/outlookFolderResolveNode";
import { OutlookMessageGetNode } from "./mail/outlookMessageGetNode";
import { OutlookMessagePatchNode } from "./mail/outlookMessagePatchNode";
import { OutlookMessageReplyNode } from "./mail/outlookMessageReplyNode";
import { OutlookMessageSendNode } from "./mail/outlookMessageSendNode";
import { OnNewMsGraphMailTriggerNode } from "./mail/onNewMailNode";

/**
 * Register all MS Graph nodes and credential types into a plugin context.
 * Called by codemation.plugin.ts and can also be used in custom host setups.
 */
export function register(ctx: CodemationPluginContext): void {
  ctx.registerCredentialType(msGraphMailOAuthCredentialType);
  ctx.registerCredentialType(msGraphDriveOAuthCredentialType);
  ctx.registerNode(OnNewMsGraphMailTriggerNode);
  ctx.registerNode(OutlookMessageGetNode);
  ctx.registerNode(OutlookMessageReplyNode);
  ctx.registerNode(OutlookMessageSendNode);
  ctx.registerNode(OutlookMessagePatchNode);
  ctx.registerNode(OutlookFolderResolveNode);
  ctx.registerNode(DriveResolveNode);
  // PR B2–B5: Drive nodes
  ctx.registerNode(DriveListChildrenNode);
  ctx.registerNode(DriveItemGetNode);
  // These three have optional interface-typed constructor params (UploadHttp/DownloadHttp/CopyHttp)
  // for test seams. Interfaces erase at runtime, so tsyringe can't introspect the params and
  // throws "TypeInfo not known" — register via factory to bypass DI param resolution.
  ctx.registerFactory(DriveDownloadNode, () => new DriveDownloadNode());
  ctx.registerFactory(DriveUploadNode, () => new DriveUploadNode());
  // PR B6–B7: Drive copy + enumeration
  ctx.registerFactory(DriveCopyNode, () => new DriveCopyNode());
  ctx.registerNode(DriveListMyDrivesNode);
  ctx.registerNode(DriveListSharedWithMeNode);
  // PR C0+C1: Excel session open/close
  ctx.registerNode(ExcelOpenWorkbookNode);
  ctx.registerNode(ExcelCloseWorkbookNode);
  // PR C2–C6: Excel workbook nodes
  ctx.registerNode(ExcelListWorksheetsNode);
  ctx.registerNode(ExcelReadRangeNode);
  ctx.registerNode(ExcelWriteRangeNode);
  ctx.registerNode(ExcelAddSheetNode);
  ctx.registerNode(ExcelStyleRangeNode);
}
