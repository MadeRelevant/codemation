import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { closeWorkbookSession } from "./session";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const ExcelCloseWorkbookInputSchema = z.object({
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

export type ExcelCloseWorkbookInput = z.infer<typeof ExcelCloseWorkbookInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelCloseWorkbookOutput = {
  closed: true;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelCloseWorkbookOptions = Readonly<{
  handle?: WorkbookHandle;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelCloseWorkbook(
  session: MsGraphSession,
  cfg: ExcelCloseWorkbookOptions,
  itemJson: unknown,
): Promise<ExcelCloseWorkbookOutput> {
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelCloseWorkbookNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }

  const { handle } = ExcelCloseWorkbookInputSchema.parse({ handle: resolvedHandle });
  await closeWorkbookSession({ session, handle });
  return { closed: true as const };
}

export const excelCloseWorkbookNode = defineNode({
  key: "msgraph-excel.close-workbook",
  title: "Close Excel workbook",
  description: "Close a Microsoft Graph Excel workbook session (idempotent). Pair with ExcelOpenWorkbook.",
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
    return executeExcelCloseWorkbook(session, config as unknown as ExcelCloseWorkbookOptions, item.json);
  },
});
