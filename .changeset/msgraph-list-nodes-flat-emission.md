---
"@codemation/core-nodes-msgraph": minor
---

**Breaking output shape change**: `DriveListMyDrivesNode`, `DriveListChildrenNode`, `DriveListSharedWithMeNode`, and `ExcelListWorksheetsNode` now emit one item per record instead of wrapping results in a single item.

- `DriveListMyDrives` — each item's `json` is `DriveInfo` (previously `{ drives: DriveInfo[] }`)
- `DriveListChildren` — each item's `json` is `DriveChildItem` (previously `{ items: DriveChildItem[], truncated: boolean }`; truncation is now implicit via output count vs `cfg.maxItems`)
- `DriveListSharedWithMe` — each item's `json` is `SharedWithMeItem` (previously `{ items: SharedWithMeItem[] }`)
- `ExcelListWorksheets` — each item's `json` is `WorksheetInfo & { handle }` (previously `{ worksheets: WorksheetInfo[], handle }`); the possibly-renewed `WorkbookHandle` is now attached to every worksheet item directly

The removed wrapper types `DriveListMyDrivesOutput`, `DriveListChildrenOutput`, `DriveListSharedWithMeOutput`, and `ExcelListWorksheetsOutput` are no longer exported.
