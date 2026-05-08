import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { rangePath, usedRangePath } from "./paths";

// ---------------------------------------------------------------------------
// Date serial helper
// ---------------------------------------------------------------------------

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;

  const unixMs = (serial - 25569) * 86400 * 1000;
  return new Date(unixMs).toISOString();
}

function isDateFormat(fmt: string): boolean {
  if (!fmt || fmt === "General" || fmt === "@") return false;
  const lower = fmt.toLowerCase();
  return /[ymdhs]/.test(lower);
}

function decodeDateSerials(values: unknown[][], numberFormat: string[][] | undefined): unknown[][] {
  if (!numberFormat || numberFormat.length === 0) return values;

  return values.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (typeof cell !== "number" || !Number.isFinite(cell)) return cell;
      const fmt = numberFormat[rowIndex]?.[colIndex];
      if (!fmt || !isDateFormat(fmt)) return cell;
      const iso = excelSerialToIso(cell);
      return iso !== null ? iso : cell;
    }),
  );
}

// ---------------------------------------------------------------------------
// Raw Graph response types
// ---------------------------------------------------------------------------

type RangeResponse = {
  address: string;
  rowCount: number;
  columnCount: number;
  values: unknown[][];
  formulas?: unknown[][];
  numberFormat?: string[][];
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ExcelReadRangeInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) => val !== null && typeof val === "object" && typeof (val as WorkbookHandle).sessionId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
  sheet: z.string().min(1),
  range: z.string().default("usedRange"),
  valuesOnly: z.boolean().default(true),
  includeFormulas: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelReadRangeOutput = WorkbookHandle & {
  values: unknown[][];
  address: string;
  rowCount: number;
  columnCount: number;
  formulas?: unknown[][];
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelReadRangeOptions = Readonly<{
  handle?: WorkbookHandle;
  sheet: string;
  range?: string;
  valuesOnly?: boolean;
  includeFormulas?: boolean;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelReadRange(
  session: MsGraphSession,
  cfg: ExcelReadRangeOptions,
  itemJson: unknown,
): Promise<ExcelReadRangeOutput> {
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelReadRangeNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }

  const input = ExcelReadRangeInputSchema.parse({
    handle: resolvedHandle,
    sheet: cfg.sheet,
    range: cfg.range,
    valuesOnly: cfg.valuesOnly,
    includeFormulas: cfg.includeFormulas,
  });

  const { handle, sheet, range, includeFormulas } = input;
  const effectiveValuesOnly = input.valuesOnly && !includeFormulas;

  const path =
    range === "usedRange" ? usedRangePath(handle, sheet, effectiveValuesOnly) : rangePath(handle, sheet, range);

  const result = await workbookFetch({ session, handle, method: "GET", path });
  const body = result.json as RangeResponse;

  const rawValues = body.values ?? [];
  const decodedValues =
    !effectiveValuesOnly && body.numberFormat ? decodeDateSerials(rawValues, body.numberFormat) : rawValues;

  const output: ExcelReadRangeOutput = {
    ...result.handle,
    values: decodedValues,
    address: body.address,
    rowCount: body.rowCount,
    columnCount: body.columnCount,
  };

  if (includeFormulas && body.formulas !== undefined) {
    output.formulas = body.formulas;
  }

  return output;
}

export const excelReadRangeNode = defineNode({
  key: "msgraph-excel.read-range",
  title: "Read Excel range",
  description: "Read values (and optionally formulas) from a worksheet range. Defaults to usedRange(valuesOnly=true).",
  icon: "builtin:microsoft-excel",
  inspectorSummary({ config }) {
    const cfg = config as unknown as ExcelReadRangeOptions;
    const rows = [];
    if (cfg.sheet) rows.push({ label: "Sheet", value: cfg.sheet });
    rows.push({ label: "Range", value: cfg.range ?? "usedRange" });
    if (cfg.includeFormulas) rows.push({ label: "Include formulas", value: "yes" });
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
    return executeExcelReadRange(session, config as unknown as ExcelReadRangeOptions, item.json);
  },
});
