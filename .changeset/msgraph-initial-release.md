---
"@codemation/core-nodes-msgraph": minor
---

Initial release of `@codemation/core-nodes-msgraph` — Microsoft Graph integration for Codemation. Covers Outlook mail, OneDrive / SharePoint Drive, and Excel workbook operations.

**Authoring**: every node is a single declarative `defineNode({...})` (or `definePollingTrigger` / `defineRestNode`). Credentials are split into two focused types — `msgraph-mail-oauth` (Outlook scopes) and `msgraph-drive-oauth` (OneDrive / SharePoint / Excel scopes) — so users connect each service with the narrowest scope set.

**Outlook (6 nodes + trigger)**: `OnNewMsGraphMailTrigger` (polling, with attachment metadata + optional binary download), `OutlookMessageGet`, `OutlookMessageReply`, `OutlookMessageSend`, `OutlookMessagePatch`, `OutlookFolderResolve`.

**Drive (8 nodes)**: `DriveResolve` (5-variant lookup: personalPath, sharedLink, driveItem, sharedWithMe, byName), `DriveListChildren`, `DriveItemGet`, `DriveDownload`, `DriveUpload` (auto simple-PUT vs chunked session at 4 MiB), `DriveCopy` (async 202 with monitor polling), `DriveListMyDrives`, `DriveListSharedWithMe`.

**Excel workbook (7 nodes)**: session-managed `ExcelOpenWorkbook` / `ExcelCloseWorkbook` with cookie-affinity + transparent session renewal, `ExcelListWorksheets`, `ExcelReadRange`, `ExcelWriteRange`, `ExcelAddSheet` (idempotent — create-or-reuse), `ExcelStyleRange` (font / fill / alignment / borders / numberFormat / merge / autofit, batched + Graph-conformant sub-resource PATCHes).

**Chaining ergonomics**: drive nodes and `ExcelOpenWorkbook` fall back to `item.json.driveId` / `itemId` when their cfg fields are empty; Excel session nodes fall back to the flat `WorkbookHandle` fields on `item.json`. So `DriveResolve → ExcelOpenWorkbook → ExcelWriteRange → ExcelCloseWorkbook` runs end-to-end without UI expression wiring. List-style nodes (`DriveListMyDrives`, `DriveListChildren`, `DriveListSharedWithMe`, `ExcelListWorksheets`) emit one item per record — the engine wraps each as `{ json: <record> }`.

**Escape hatch**: when no built-in node fits, drop a Callback on the canvas, attach a Microsoft Graph credential to its `auth` slot, and use the re-exported `createGraphClient(session)` to get an authenticated Graph SDK client.

**Microsoft Outlook / OneDrive / Excel SVG icons** added to the canvas builtin icon registry (`builtin:microsoft-outlook` etc.).
