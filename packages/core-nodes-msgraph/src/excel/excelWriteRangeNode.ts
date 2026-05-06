import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { rangePath, usedRangePath, columnNumberToLetter } from "./paths";

// ---------------------------------------------------------------------------
// Raw Graph response types
// ---------------------------------------------------------------------------

type UsedRangeAddressResponse = {
  address: string;
  rowCount: number;
  columnCount: number;
};

type WriteRangeResponse = {
  address: string;
  rowCount: number;
  columnCount: number;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ExcelWriteRangeInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) => val !== null && typeof val === "object" && typeof (val as WorkbookHandle).sessionId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
  sheet: z.string().min(1),
  range: z.string().optional(),
  values: z.array(z.array(z.unknown())).min(1),
  appendBelow: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelWriteRangeOutput = WorkbookHandle & {
  address: string;
  rowCount: number;
  columnCount: number;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelWriteRangeOptions = Readonly<{
  handle?: WorkbookHandle;
  sheet: string;
  range?: string;
  values: unknown[][];
  appendBelow?: boolean;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelWriteRange(
  session: MsGraphSession,
  cfg: ExcelWriteRangeOptions,
  itemJson: unknown,
): Promise<ExcelWriteRangeOutput> {
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelWriteRangeNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }

  const input = ExcelWriteRangeInputSchema.parse({
    handle: resolvedHandle,
    sheet: cfg.sheet,
    range: cfg.range,
    values: cfg.values,
    appendBelow: cfg.appendBelow,
  });

  const { values, sheet, appendBelow } = input;
  let { handle } = input;
  let targetRange: string;

  if (appendBelow) {
    const usedRangeResult = await workbookFetch({
      session,
      handle,
      method: "GET",
      path: usedRangePath(handle, sheet, false),
      query: { $select: "address,rowCount,columnCount" },
    });
    handle = usedRangeResult.handle;
    const usedRangeBody = usedRangeResult.json as UsedRangeAddressResponse;
    const nextRow = usedRangeBody.rowCount + 1;
    const numCols = values[0]?.length ?? 1;
    const endCol = columnNumberToLetter(numCols);
    const endRow = nextRow + values.length - 1;
    targetRange = `A${nextRow}:${endCol}${endRow}`;
  } else {
    if (!input.range) throw new Error("ExcelWriteRangeNode: `range` is required when `appendBelow` is false.");
    targetRange = input.range;
  }

  const writeResult = await workbookFetch({
    session,
    handle,
    method: "PATCH",
    path: rangePath(handle, sheet, targetRange),
    body: { values },
  });
  const writeBody = writeResult.json as WriteRangeResponse;

  return {
    ...writeResult.handle,
    address: writeBody.address ?? targetRange,
    rowCount: writeBody.rowCount ?? values.length,
    columnCount: writeBody.columnCount ?? values[0]?.length ?? 0,
  };
}

export const excelWriteRangeNode = defineNode({
  key: "msgraph-excel.write-range",
  title: "Write Excel range",
  description: "Write values into a worksheet range. Supports append-below mode.",
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
    return executeExcelWriteRange(session, config as unknown as ExcelWriteRangeOptions, item.json);
  },
});
