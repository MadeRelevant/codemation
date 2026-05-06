/**
 * Demo: open an Excel workbook, add a sheet, write data, read it back, style it, then close.
 *
 * Chain: ManualTrigger → DriveResolve → ExcelOpenWorkbook → ExcelAddSheet →
 *        ExcelWriteRange → ExcelReadRange → ExcelStyleRange → ExcelCloseWorkbook
 *
 * Each node declares its own `auth` credential slot so the UI shows a binding
 * picker for every step — this replaces the old single-Callback workaround.
 *
 * Handle threading: ExcelOpenWorkbook writes the flat WorkbookHandle fields to item.json.
 * Downstream nodes fall back to item.json (detected by presence of sessionId) when
 * their cfg.handle is not supplied, so the handle flows through the chain automatically.
 *
 * ExcelListWorksheets is intentionally omitted from this chain: it fans out one
 * item per worksheet, which breaks the linear write/read/close cycle. A separate
 * micro-demo can cover listing.
 *
 * Prerequisites: create `/codemation-test.xlsx` once in your OneDrive root.
 * The trigger defaults below point to that file.
 */
import { ManualTrigger, createWorkflowBuilder } from "@codemation/core-nodes";
import {
  driveResolveNode,
  excelAddSheetNode,
  excelCloseWorkbookNode,
  excelOpenWorkbookNode,
  excelReadRangeNode,
  excelStyleRangeNode,
  excelWriteRangeNode,
} from "../../src/index";

export default createWorkflowBuilder({
  id: "wf.msgraph.excel.session-demo",
  name: "MS Graph — Excel open/write/read/style/close demo",
})
  .trigger(
    new ManualTrigger(
      "Manual trigger",
      {
        workbookPath: "/codemation-test.xlsx",
        demoSheet: "codemation-demo",
        headerRange: "A1:B1",
        dataRange: "A1:B2",
      },
      "msgraph_excel_manual",
    ),
  )
  // Step 1: resolve workbook path → { driveId, itemId } on item.json.
  .then(
    driveResolveNode.create(
      {
        input: {
          kind: "personalPath",
          path: "/codemation-test.xlsx",
        },
      },
      "Resolve workbook path",
      "msgraph_excel_resolve",
    ),
  )
  // Step 2: open a workbook session.
  // driveId/itemId fall back to item.json from DriveResolve when left empty.
  .then(
    excelOpenWorkbookNode.create(
      {
        driveId: "",
        itemId: "",
        persistChanges: true,
      },
      "Open workbook session",
      "msgraph_excel_open",
    ) as never,
  )
  // Step 3: add a demo worksheet.
  // handle falls back to item.json (flat WorkbookHandle) from ExcelOpenWorkbook.
  .then(
    excelAddSheetNode.create(
      {
        name: "codemation-demo",
      },
      "Add demo sheet",
      "msgraph_excel_add_sheet",
    ) as never,
  )
  // Step 4: write header + data rows.
  // handle falls back to item.json (renewed by ExcelAddSheet).
  .then(
    excelWriteRangeNode.create(
      {
        sheet: "codemation-demo",
        range: "A1:B2",
        values: [
          ["Timestamp", "Message"],
          [new Date(0).toISOString(), "Codemation Excel demo"],
        ],
      },
      "Write demo data",
      "msgraph_excel_write",
    ) as never,
  )
  // Step 5: read back the written range.
  // handle falls back to item.json (renewed by ExcelWriteRange).
  .then(
    excelReadRangeNode.create(
      {
        sheet: "codemation-demo",
        range: "A1:B2",
      },
      "Read demo data",
      "msgraph_excel_read",
    ) as never,
  )
  // Step 6: bold + highlight the header row.
  // handle falls back to item.json (renewed by ExcelReadRange).
  .then(
    excelStyleRangeNode.create(
      {
        sheet: "codemation-demo",
        range: "A1:B1",
        font: { bold: true },
        fill: { color: "#D9EAF7" },
        autofitColumns: true,
      },
      "Style header row",
      "msgraph_excel_style",
    ) as never,
  )
  // Step 7: close the session.
  // handle falls back to item.json (renewed by ExcelStyleRange).
  // Note: CloseWorkbook does not emit handle fields — post-close the handle is moot.
  .then(excelCloseWorkbookNode.create({}, "Close workbook session", "msgraph_excel_close") as never)
  .build();
