---
"@codemation/core-nodes-msgraph": minor
---

Round of runtime fixes, regression tests, and properties-panel polish for the MS Graph node package:

- DriveResolve handles `personalPath: "/"` (Graph rejects the trailing-colon syntax for empty paths — uses `/me/drive/root` instead).
- DriveListChildren / DriveUpload / DriveDownload / ExcelOpenWorkbook fall back to `item.json.driveId` / `itemId` when cfg fields are empty, so DriveResolve→ExcelOpenWorkbook chains flow without UI expression wiring.
- DriveDownload handles both Web `ReadableStream` (Node 20+/Graph SDK 3.x) and Node `Readable` from `getStream()`.
- ExcelStyleRange PATCHes `font` and `fill` at their separate sub-resources (`/format/font`, `/format/fill`) — Graph rejects them nested on the top-level `/format` body.
- ExcelAddSheet is idempotent: on a 400/409 from Graph it looks up the existing worksheet by name and returns its details, so workflows don't need an `if exists` branch.
- OnNewMail `$expand=attachments($select=…)` uses the type-cast prefix `microsoft.graph.fileAttachment/contentId` (the base `microsoft.graph.attachment` type doesn't carry `contentId`).
- DriveUpload / DriveDownload / DriveCopy register via `ctx.registerFactory` to avoid tsyringe's `TypeInfo not known` for their interface-typed optional ctor params.
- All 21 node config classes' `description` getters rewritten to be human-readable in the properties panel (no more "Drive `item`").
- Microsoft Outlook / OneDrive / Excel SVG icons added (`builtin:microsoft-outlook` etc.) and wired into the canvas icon registry.
- 7 regression tests added covering each of the runtime fixes above.
