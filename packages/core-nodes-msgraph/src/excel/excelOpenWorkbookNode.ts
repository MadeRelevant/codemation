import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { openWorkbookSession } from "./session";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const ExcelOpenWorkbookInputSchema = z.object({
  driveId: z.string().min(1),
  itemId: z.string().min(1),
  persistChanges: z.boolean().default(true),
});

export type ExcelOpenWorkbookInput = z.infer<typeof ExcelOpenWorkbookInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelOpenWorkbookOutput = WorkbookHandle;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelOpenWorkbookOptions = Readonly<{
  driveId: string;
  itemId: string;
  persistChanges?: boolean;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelOpenWorkbook(
  session: MsGraphSession,
  cfg: ExcelOpenWorkbookOptions,
  itemJson: unknown,
): Promise<ExcelOpenWorkbookOutput> {
  const fromItem = (itemJson ?? {}) as { driveId?: string; itemId?: string };
  const input = ExcelOpenWorkbookInputSchema.parse({
    driveId: cfg.driveId || fromItem.driveId,
    itemId: cfg.itemId || fromItem.itemId,
    persistChanges: cfg.persistChanges,
  });

  return openWorkbookSession({
    session,
    driveId: input.driveId,
    itemId: input.itemId,
    persistChanges: input.persistChanges,
  });
}

export const excelOpenWorkbookNode = defineNode({
  key: "msgraph-excel.open-workbook",
  title: "Open Excel workbook",
  description:
    "Open a Microsoft Graph Excel workbook session. Pair with ExcelCloseWorkbook. Falls back to item.json driveId/itemId.",
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
    return executeExcelOpenWorkbook(session, config as unknown as ExcelOpenWorkbookOptions, item.json);
  },
});
