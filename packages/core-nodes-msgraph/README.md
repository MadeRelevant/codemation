# @codemation/core-nodes-msgraph

Microsoft Graph node set for Codemation — Outlook mail, OneDrive / SharePoint Drive, and Excel workbook operations.

## Usage

Install the package and Codemation auto-discovers the plugin via `package.json#codemation.plugin`. The plugin ships two credential types (so you can grant narrower scopes per service) and ~20 nodes across three families.

## Credential types

Two separate credential types so you can connect Mail and Drive (incl. Excel) independently:

- **`msgraph-mail-oauth`** — Outlook nodes (trigger + send/reply/get/patch + folder resolve). Scope presets: `read-mail`, `read-write-mail`, `send-mail`, `mail-all`.
- **`msgraph-drive-oauth`** — OneDrive / SharePoint Drive nodes + Excel nodes (Excel sits on the Files API). Scope presets: `files-read`, `files-readwrite`, `drive-all` (adds `Sites.ReadWrite.All`).

Both reuse the same Azure app registration env vars (`CODEMATION_MSGRAPH_CLIENT_ID`, `_TENANT_ID`, `_CLIENT_SECRET`) — connect each separately so OAuth tokens carry the right scopes.

## Node families

- **Outlook mail** — On-new-mail trigger, message get / reply / send / patch, folder resolve.
- **Drive (OneDrive / SharePoint)** — `DriveResolve` for path-based id lookup, list-children / list-my-drives / list-shared-with-me, item get, download, upload, copy.
- **Excel workbook** — session-managed `ExcelOpenWorkbook` / `ExcelCloseWorkbook` + worksheet listing, range read / write, sheet add (idempotent — create-or-reuse), cell formatting.

Most drive and Excel nodes fall back to `item.json.driveId` / `itemId` (and the flat `WorkbookHandle` fields) when their cfg ids are empty, so chains like `DriveResolve → ExcelOpenWorkbook → ExcelWriteRange → ExcelCloseWorkbook` flow without UI expression wiring.

## Escape hatch — direct Graph SDK access from a Callback

When no built-in node covers your case, drop a Callback (or any custom node) on the canvas, attach a Microsoft Graph credential to its `auth` slot in the UI, and grab an authenticated SDK client:

```ts
import { Callback } from "@codemation/core-nodes";
import { createGraphClient, type MsGraphSession } from "@codemation/core-nodes-msgraph";

new Callback("Graph escape hatch", async (items, ctx) => {
  const session = await ctx.getCredential<MsGraphSession>("auth");
  const graph = createGraphClient(session);

  // Any Graph SDK call — sessions auto-refresh tokens transparently.
  const me = await graph.api("/me").select("id,displayName,userPrincipalName").get();

  return items.map((item) => ({ ...item, json: { ...(item.json as object), me } }));
});
```

Use **`MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID`** when your call needs Outlook scopes, **`MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID`** when it needs Files / Sites scopes. The runtime contract is identical; only the granted token scopes differ.

For Excel workbook calls (sessions, range PATCH bodies, etc.) prefer the built-in nodes — they handle session affinity, transparent renewal, and Graph's quirky sub-resource endpoints (e.g. `/format/font` vs `/format`). If you must call Excel manually, study `src/excel/session.ts` first.

## Plugin / authoring docs

Refer to the Codemation plugin and credential authoring docs for the wider configuration model.

---

## Node reference

### Outlook mail (credential: `msgraph-mail-oauth`)

| Node                        | What it does                                                                                                                                                                                                                                    | Key options                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OnNewMsGraphMailTrigger`   | Polls a mailbox folder and fires once per new message.                                                                                                                                                                                          | `mailbox: string`, `folderId?="Inbox"`, `filter?="isRead eq false"`, `downloadAttachments?=false`, `attachmentSizeCapBytes?=26214400`, `pollIntervalMs?=60000`                 |
| `OutlookMessageGet`         | Fetches a single Outlook message by id.                                                                                                                                                                                                         | `mailbox: string`, `messageId: string`, `expandAttachments?=false`                                                                                                             |
| `OutlookMessageReply`       | Creates a reply, reply-all, or forward draft then sends (or saves as draft).                                                                                                                                                                    | `mailbox: string`, `messageId: string`, `body: string`, `bodyType: "html"\|"text"`, `forward?`, `replyAll?`, `to?`, `cc?`, `bcc?`, `draftOnly?`, `attachments?`, `importance?` |
| `OutlookMessageSend`        | Composes and sends a new message (or saves as draft).                                                                                                                                                                                           | `mailbox: string`, `to: string[]`, `subject: string`, `body: string`, `bodyType: "html"\|"text"`, `cc?`, `bcc?`, `attachments?`, `importance?`, `draftOnly?`                   |
| `OutlookMessagePatch`       | Updates message properties (read-state, categories, folder).                                                                                                                                                                                    | `mailbox: string`, `messageId: string`, `isRead?`, `categories?`, `move?: { folderId }`                                                                                        |
| `OutlookFolderResolve`      | Resolves a `/`-separated display-name path to a Graph folder id, optionally creating missing segments.                                                                                                                                          | `mailbox: string`, `folderPath: string`, `createIfMissing?=false`                                                                                                              |
| `OutlookAttachmentDownload` | Downloads a single `fileAttachment` by id and stores its bytes in a binary slot via `ctx.binary`. Refuses `itemAttachment`/`referenceAttachment` with a clear error. Falls back to `item.json.messageId`/`attachmentId` when cfg ids are empty. | `mailbox?="me"`, `messageId: string`, `attachmentId: string`, `binarySlot?="attachment"`, `sizeCapBytes?=26214400`                                                             |

### Drive — OneDrive / SharePoint (credential: `msgraph-drive-oauth`)

| Node                    | What it does                                                                              | Key options                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DriveResolve`          | Resolves a drive item to canonical `driveId + itemId` via one of five lookup strategies.  | `input: { kind: "personalPath", path } \| { kind: "sharedLink", url } \| { kind: "driveItem", driveId, itemId } \| { kind: "sharedWithMe", name } \| { kind: "byName", driveId, parentItemId, name }` |
| `DriveListChildren`     | Lists children of a folder, with optional filtering and pagination.                       | `driveId: string`, `itemId: string` (`"root"` for root), `filter?`, `orderBy?`, `top?=200`, `maxItems?=1000`                                                                                          |
| `DriveItemGet`          | Fetches full metadata for a drive item.                                                   | `driveId: string`, `itemId: string`, `expand?: ("listItem"\|"permissions"\|"thumbnails")[]`                                                                                                           |
| `DriveDownload`         | Downloads a file to a binary slot via `ctx.binary`.                                       | `driveId: string`, `itemId: string`, `sizeCapBytes?=104857600`                                                                                                                                        |
| `DriveUpload`           | Uploads a file from a binary slot (auto-selects simple PUT vs chunked session at 4 MiB).  | `driveId: string`, `parentItemId: string`, `name: string`, `binarySlot: string`, `conflictBehavior?="replace"`                                                                                        |
| `DriveCopy`             | Copies a drive item to another folder, optionally polling until completion.               | `sourceDriveId: string`, `sourceItemId: string`, `targetDriveId: string`, `targetParentItemId: string`, `name?`, `awaitCompletion?=true`, `pollIntervalMs?=1000`, `timeoutMs?=300000`                 |
| `DriveListMyDrives`     | Lists all drives (personal and business) accessible to the connected user.                | _(no options)_                                                                                                                                                                                        |
| `DriveListSharedWithMe` | Lists items shared with the connected user, emitting canonical remote `driveId + itemId`. | _(no options)_                                                                                                                                                                                        |

### Excel workbook (credential: `msgraph-drive-oauth`)

| Node                  | What it does                                                                                                                                 | Key options                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ExcelOpenWorkbook`   | Opens a Graph Excel session and emits a `WorkbookHandle` on item.json.                                                                       | `driveId: string`, `itemId: string`, `persistChanges?=true`                                                                                                                                                                          |
| `ExcelCloseWorkbook`  | Closes the open Excel session (idempotent).                                                                                                  | `handle?: WorkbookHandle` _(falls back to item.json)_                                                                                                                                                                                |
| `ExcelListWorksheets` | Lists all worksheets, emitting one item per sheet with handle fields merged in.                                                              | `handle?: WorkbookHandle` _(falls back to item.json)_                                                                                                                                                                                |
| `ExcelReadRange`      | Reads values (and optionally formulas) from a worksheet range; decodes date serials when `valuesOnly: false`.                                | `sheet: string`, `range?="usedRange"`, `valuesOnly?=true`, `includeFormulas?=false`, `handle?`                                                                                                                                       |
| `ExcelWriteRange`     | Writes a 2-D values array to a range, or appends below the current used range.                                                               | `sheet: string`, `values: unknown[][]`, `range?`, `appendBelow?=false`, `handle?`                                                                                                                                                    |
| `ExcelAddSheet`       | Creates a worksheet (idempotent — reuses existing if name already exists), optionally copying from another sheet.                            | `name: string`, `copyFrom?: { sheetName }`, `handle?`                                                                                                                                                                                |
| `ExcelStyleRange`     | Applies formatting (font, fill, alignment, borders, numberFormat, merge, autofit) to a range in a single or batched set of PATCH/POST calls. | `sheet: string`, `range: string`, `font?: { bold, italic, color, size, name, underline }`, `fill?: { color }`, `alignment?: { horizontal, vertical, wrapText }`, `borders?`, `numberFormat?`, `merge?`, `autofitColumns?`, `handle?` |

### Chaining notes

Drive nodes (`DriveResolve`, `DriveListChildren`, `DriveUpload`, `DriveDownload`) and `ExcelOpenWorkbook` fall back to `item.json.driveId` / `itemId` when cfg ids are empty, so `DriveResolve → ExcelOpenWorkbook → ExcelWriteRange → ExcelCloseWorkbook` chains run with no UI expression wiring.
Excel session nodes downstream of `ExcelOpenWorkbook` similarly read `WorkbookHandle` fields from item.json using the flat shape: `driveId, itemId, sessionId, expiresAt, cookies, persistChanges`.
List-style nodes (`DriveListMyDrives`, `DriveListChildren`, `DriveListSharedWithMe`, `ExcelListWorksheets`) return an array — the engine wraps each element as `{ json: <record> }`, so each downstream step processes one record.
