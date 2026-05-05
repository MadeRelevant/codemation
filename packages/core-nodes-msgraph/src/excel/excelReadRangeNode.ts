import type {
  CredentialRequirement,
  Item,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { z } from "zod";
import { MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { rangePath, usedRangePath } from "./paths";

// ---------------------------------------------------------------------------
// Date serial helper
// ---------------------------------------------------------------------------

/**
 * Convert an Excel date serial number to an ISO 8601 date string.
 *
 * Excel's date serial epoch is December 30, 1899 (with a well-known bug:
 * Excel incorrectly treats 1900 as a leap year, so serial 60 is the phantom
 * "1900-02-29"). The standard correction formula subtracts 25569 days to get
 * the Unix epoch offset:
 *
 *   new Date((serial - 25569) * 86400 * 1000)
 *
 * **1900 leap-year quirk**: serials 1–59 are off by one day versus this
 * formula because Excel believes serial 60 = 1900-02-29. We accept this
 * silent off-by-one for legacy data — every Excel-aware library does the
 * same — rather than complicating the logic for pre-March-1900 dates that
 * virtually no real-world data contains.
 *
 * @returns ISO 8601 date string (e.g. "1970-01-01T00:00:00.000Z") or `null`
 *   for invalid / out-of-range inputs (NaN, Infinity, negative serials).
 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;

  const unixMs = (serial - 25569) * 86400 * 1000;
  return new Date(unixMs).toISOString();
}

// ---------------------------------------------------------------------------
// Date format detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the given Excel number-format string looks like a date
 * format. Detection criteria: contains at least one of the date-format
 * characters (y, m, d, h, s) and is not one of the generic/plain-number
 * formats ("General", "@").
 *
 * Note: `#,##0` contains `#` and `0` but is a number format, not a date format.
 * We rely on the presence of date letters (y/m/d/h/s) which unambiguously
 * identify date formats.
 */
function isDateFormat(fmt: string): boolean {
  if (!fmt || fmt === "General" || fmt === "@") return false;
  const lower = fmt.toLowerCase();
  return /[ymdhs]/.test(lower);
}

/**
 * Apply date-serial decoding to a values matrix when a corresponding
 * `numberFormat` matrix is available.
 *
 * Only cells that:
 *   1. Have a date-like numberFormat for their cell position, AND
 *   2. Have a finite numeric value
 * are decoded to ISO strings. All other cells are returned unchanged.
 */
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
  /**
   * Range address or "usedRange". Defaults to "usedRange".
   * - "usedRange": reads the entire used range of the sheet.
   * - "A1:B10" (or any range address): reads that specific range.
   */
  range: z.string().default("usedRange"),
  /**
   * When true (default), only values are returned — no formatting metadata.
   * When false, formatting metadata (numberFormat, etc.) is included, which
   * enables automatic date-serial decoding.
   */
  valuesOnly: z.boolean().default(true),
  /**
   * When true, formulas are included in the response alongside values.
   * Default: false.
   */
  includeFormulas: z.boolean().default(false),
});

type ExcelReadRangeInput = z.infer<typeof ExcelReadRangeInputSchema>;

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
// Options / Config
// ---------------------------------------------------------------------------

export type ExcelReadRangeOptions = Readonly<{
  handle?: WorkbookHandle;
  sheet: string;
  range?: string;
  valuesOnly?: boolean;
  includeFormulas?: boolean;
}>;

/**
 * Read values (and optionally formulas) from a worksheet range.
 *
 * Defaults to `usedRange(valuesOnly=true)` — the most common read pattern.
 * Set `valuesOnly: false` to receive formatting metadata, which enables
 * automatic decoding of Excel date serials to ISO 8601 strings.
 *
 * **Formula note**: when `includeFormulas: true`, the node automatically
 * promotes to the full (non-valuesOnly) response path even if `valuesOnly`
 * is `true`, because Graph's `usedRange(valuesOnly=true)` endpoint strips
 * formula data from responses.
 */
export class ExcelReadRange implements RunnableNodeConfig<ExcelReadRangeOptions, ExcelReadRangeOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelReadRangeNode;
  readonly icon = "builtin:microsoft-excel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelReadRangeOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const sheet = this.cfg.sheet?.trim();
    const range = this.cfg.range?.trim() || "usedRange";
    const formulasSuffix = this.cfg.includeFormulas ? " (with formulas)" : "";
    return sheet
      ? `Read range \`${sheet}!${range}\` from the open workbook${formulasSuffix}.`
      : `Read range \`${range}\` from the open workbook (sheet from upstream)${formulasSuffix}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class ExcelReadRangeNode implements RunnableNode<ExcelReadRange> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelReadRange>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    // Fall back to item.json so ExcelOpenWorkbook → ExcelReadRange chains without UI handle wiring.
    // Discriminate a real WorkbookHandle (has sessionId) from plain item.json (e.g. DriveResolve output).
    const fromItem = args.item.json as Partial<WorkbookHandle> | undefined;
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

    const input: ExcelReadRangeInput = ExcelReadRangeInputSchema.parse({
      handle: resolvedHandle,
      sheet: cfg.sheet,
      range: cfg.range,
      valuesOnly: cfg.valuesOnly,
      includeFormulas: cfg.includeFormulas,
    });

    const { handle, sheet, range, includeFormulas } = input;

    // When includeFormulas is true, we must NOT use usedRange(valuesOnly=true) —
    // Graph strips formula data from valuesOnly responses. Auto-promote to the
    // full response path so formulas are available.
    const effectiveValuesOnly = input.valuesOnly && !includeFormulas;

    // Build URL path based on range type
    let path: string;
    if (range === "usedRange") {
      path = usedRangePath(handle, sheet, effectiveValuesOnly);
    } else {
      path = rangePath(handle, sheet, range);
    }

    // When formulas are requested, Graph returns them inline with values.
    // No special query param needed — they come back in the same response.
    const result = await workbookFetch({
      session,
      handle,
      method: "GET",
      path,
    });

    const body = result.json as RangeResponse;

    // Decode date serials when formatting metadata is available (effectiveValuesOnly=false)
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

    return { ...(args.item as Item), json: output };
  }
}
