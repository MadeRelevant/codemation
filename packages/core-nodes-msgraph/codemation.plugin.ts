import { defineCodemationApp, definePlugin } from "@codemation/host/authoring";
import { msGraphMailOAuthCredentialType } from "./src/credentials/msGraphMailOAuth";
import { msGraphDriveOAuthCredentialType } from "./src/credentials/msGraphDriveOAuth";
import { onNewMsGraphMailTrigger } from "./src/mail/onNewMailNode";
import { outlookMessageGetNode } from "./src/mail/outlookMessageGetNode";
import { outlookMessageReplyNode } from "./src/mail/outlookMessageReplyNode";
import { outlookMessageSendNode } from "./src/mail/outlookMessageSendNode";
import { outlookMessagePatchNode } from "./src/mail/outlookMessagePatchNode";
import { outlookFolderResolveNode } from "./src/mail/outlookFolderResolveNode";
import { driveResolveNode } from "./src/drive/driveResolveNode";
import { driveListChildrenNode } from "./src/drive/driveListChildrenNode";
import { driveItemGetNode } from "./src/drive/driveItemGetNode";
import { driveDownloadNode } from "./src/drive/driveDownloadNode";
import { driveUploadNode } from "./src/drive/driveUploadNode";
import { driveCopyNode } from "./src/drive/driveCopyNode";
import { driveListMyDrivesNode } from "./src/drive/driveListMyDrivesNode";
import { driveListSharedWithMeNode } from "./src/drive/driveListSharedWithMeNode";
import { excelOpenWorkbookNode } from "./src/excel/excelOpenWorkbookNode";
import { excelCloseWorkbookNode } from "./src/excel/excelCloseWorkbookNode";
import { excelListWorksheetsNode } from "./src/excel/excelListWorksheetsNode";
import { excelReadRangeNode } from "./src/excel/excelReadRangeNode";
import { excelWriteRangeNode } from "./src/excel/excelWriteRangeNode";
import { excelAddSheetNode } from "./src/excel/excelAddSheetNode";
import { excelStyleRangeNode } from "./src/excel/excelStyleRangeNode";

const plugin = definePlugin({
  credentials: [msGraphMailOAuthCredentialType, msGraphDriveOAuthCredentialType],
  nodes: [
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
  ],
  // onNewMsGraphMailTrigger is a DefinedPollingTrigger (not DefinedNode), so it must be
  // registered via the register callback rather than the nodes array.
  register(ctx) {
    onNewMsGraphMailTrigger.register(ctx);
  },
  sandbox: defineCodemationApp({
    name: "MS Graph plugin sandbox",
    auth: {
      kind: "local",
      allowUnauthenticatedInDevelopment: true,
    },
    database: {
      kind: "sqlite",
      filePath: ".codemation/codemation.sqlite",
    },
    execution: {
      mode: "inline",
    },
    // Dev workflows are discovered from the dev/ folder at runtime.
    workflowDiscovery: { directories: ["./dev/workflows"] },
  }),
});

export default plugin;
