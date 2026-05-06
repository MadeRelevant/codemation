/**
 * ExcelListWorksheets — emits one item per worksheet.
 *
 * Handle threading: `workbookFetch` performs a one-shot session renewal on
 * session-expired errors and returns the renewed handle. Because a GET to
 * /worksheets can therefore yield a *different* handle than it received, we
 * spread the (possibly renewed) handle fields into every emitted item's json.
 * This ensures downstream Excel nodes always receive a valid handle regardless of
 * whether a transparent renewal happened during the list call.
 */
import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { worksheetsCollectionPath } from "./paths";

// ---------------------------------------------------------------------------
// Raw Graph response types
// ---------------------------------------------------------------------------

type RawWorksheet = {
  id: string;
  name: string;
  position: number;
  visibility: "Visible" | "Hidden" | "VeryHidden";
};

type WorksheetsResponse = {
  value: RawWorksheet[];
};

// ---------------------------------------------------------------------------
// Output shape (per-item)
// ---------------------------------------------------------------------------

export type WorksheetInfo = {
  id: string;
  name: string;
  position: number;
  visibility: "Visible" | "Hidden" | "VeryHidden";
};

export type WorksheetInfoWithHandle = WorksheetInfo & WorkbookHandle;

// ---------------------------------------------------------------------------
// Input schema (validated from cfg)
// ---------------------------------------------------------------------------

const ExcelListWorksheetsInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) =>
      val !== null &&
      typeof val === "object" &&
      typeof (val as WorkbookHandle).sessionId === "string" &&
      typeof (val as WorkbookHandle).driveId === "string" &&
      typeof (val as WorkbookHandle).itemId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelListWorksheetsOptions = Readonly<{
  handle?: WorkbookHandle;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelListWorksheets(
  session: MsGraphSession,
  cfg: ExcelListWorksheetsOptions,
  itemJson: unknown,
): Promise<WorksheetInfoWithHandle[]> {
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelListWorksheetsNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }
  const { handle } = ExcelListWorksheetsInputSchema.parse({ handle: resolvedHandle });

  const path = worksheetsCollectionPath(handle);
  const result = await workbookFetch({ session, handle, method: "GET", path });

  const body = result.json as WorksheetsResponse;
  const renewedHandle = result.handle;
  return (body.value ?? []).map((ws) => ({
    id: ws.id,
    name: ws.name,
    position: ws.position,
    visibility: ws.visibility,
    ...renewedHandle,
  }));
}

export const excelListWorksheetsNode = defineNode({
  key: "msgraph-excel.list-worksheets",
  title: "List Excel worksheets",
  description: "List all worksheets in an open Excel workbook, emitting one item per sheet.",
  icon: "builtin:microsoft-excel",
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute({ item }, { config, credentials }) {
    const session = (await credentials.auth()) as MsGraphSession;
    // Engine's NodeOutputNormalizer wraps each array element as { json: el }.
    return executeExcelListWorksheets(session, config as unknown as ExcelListWorksheetsOptions, item.json);
  },
});
