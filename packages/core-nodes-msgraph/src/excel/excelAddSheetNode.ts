import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { workbookPath, worksheetPath } from "./paths";

// ---------------------------------------------------------------------------
// Raw Graph response types
// ---------------------------------------------------------------------------

type RawWorksheetInfo = {
  id: string;
  name: string;
  position: number;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ExcelAddSheetInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) => val !== null && typeof val === "object" && typeof (val as WorkbookHandle).sessionId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
  name: z.string().min(1),
  copyFrom: z
    .object({
      sheetName: z.string().min(1),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type WorksheetDetails = {
  id: string;
  name: string;
  position: number;
};

export type ExcelAddSheetOutput = WorksheetDetails & WorkbookHandle;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelAddSheetOptions = Readonly<{
  handle?: WorkbookHandle;
  name: string;
  copyFrom?: { sheetName: string };
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function (called by both defineNode and shim class)
// ---------------------------------------------------------------------------

export async function executeExcelAddSheet(
  session: MsGraphSession,
  cfg: ExcelAddSheetOptions,
  itemJson: unknown,
): Promise<ExcelAddSheetOutput> {
  // Fall back to item.json so ExcelOpenWorkbook → ExcelAddSheet chains without UI handle wiring.
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelAddSheetNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }

  const input = ExcelAddSheetInputSchema.parse({
    handle: resolvedHandle,
    name: cfg.name,
    copyFrom: cfg.copyFrom,
  });

  let { handle } = input;
  const { name, copyFrom } = input;

  let worksheet: WorksheetDetails;

  if (copyFrom) {
    const copyPath = `${worksheetPath(handle, copyFrom.sheetName)}/copy`;

    const copyResult = await workbookFetch({
      session,
      handle,
      method: "POST",
      path: copyPath,
      body: {
        positionType: "End",
        name,
      },
    });

    handle = copyResult.handle;
    const copyBody = copyResult.json as RawWorksheetInfo;

    if (copyBody.name !== name) {
      const renamePath = `${workbookPath(handle)}/worksheets('${encodeURIComponent(copyBody.name)}')`;

      const renameResult = await workbookFetch({
        session,
        handle,
        method: "PATCH",
        path: renamePath,
        body: { name },
      });

      handle = renameResult.handle;
      const renameBody = renameResult.json as RawWorksheetInfo;

      worksheet = {
        id: renameBody.id ?? copyBody.id,
        name: renameBody.name ?? name,
        position: renameBody.position ?? copyBody.position,
      };
    } else {
      worksheet = {
        id: copyBody.id,
        name: copyBody.name,
        position: copyBody.position,
      };
    }
  } else {
    // Idempotent simple add: try POST; if Graph rejects the name (already exists),
    // look up the existing worksheet by name and return that instead.
    const addPath = `${workbookPath(handle)}/worksheets/add`;

    try {
      const addResult = await workbookFetch({
        session,
        handle,
        method: "POST",
        path: addPath,
        body: { name },
      });

      handle = addResult.handle;
      const addBody = addResult.json as RawWorksheetInfo;
      worksheet = { id: addBody.id, name: addBody.name, position: addBody.position };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== 400 && status !== 409) throw err;

      const lookupPath = `${workbookPath(handle)}/worksheets('${encodeURIComponent(name)}')`;
      const lookupResult = await workbookFetch({ session, handle, method: "GET", path: lookupPath });
      handle = lookupResult.handle;
      const lookupBody = lookupResult.json as RawWorksheetInfo;
      worksheet = { id: lookupBody.id, name: lookupBody.name, position: lookupBody.position };
    }
  }

  return { ...worksheet, ...handle };
}

export const excelAddSheetNode = defineNode({
  key: "msgraph-excel.add-sheet",
  title: "Add Excel worksheet",
  description:
    "Add a new worksheet to an open workbook (idempotent — returns existing sheet if name already exists). Optionally copies from another sheet.",
  icon: "builtin:microsoft-excel",
  inspectorSummary({ config }) {
    const cfg = config as unknown as ExcelAddSheetOptions;
    const rows = [];
    if (cfg.name) rows.push({ label: "Sheet name", value: cfg.name });
    if (cfg.copyFrom?.sheetName) rows.push({ label: "Copy from", value: cfg.copyFrom.sheetName });
    return rows.length > 0 ? rows : undefined;
  },
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute({ item }, { config, credentials }) {
    const session = (await credentials.auth()) as MsGraphSession;
    return executeExcelAddSheet(session, config as unknown as ExcelAddSheetOptions, item.json);
  },
});
