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
