import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import type { WorkbookHandle } from "./session";
import { workbookFetch } from "./session";
import { rangeFormatPath, rangeBorderPath, rangePath } from "./paths";

// ---------------------------------------------------------------------------
// Border types
// ---------------------------------------------------------------------------

type BorderEdge =
  | "EdgeTop"
  | "EdgeBottom"
  | "EdgeLeft"
  | "EdgeRight"
  | "InsideHorizontal"
  | "InsideVertical"
  | "DiagonalDown"
  | "DiagonalUp";

const BorderStyleSchema = z.object({
  style: z.enum(["None", "Continuous", "Dash", "DashDot", "DashDotDot", "Dot", "Double", "SlantDashDot"]).optional(),
  color: z.string().optional(),
  weight: z.enum(["Hair", "Thin", "Medium", "Thick"]).optional(),
});

type BorderStyle = z.infer<typeof BorderStyleSchema>;

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ExcelStyleRangeInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) => val !== null && typeof val === "object" && typeof (val as WorkbookHandle).sessionId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
  sheet: z.string().min(1),
  range: z.string().min(1),

  font: z
    .object({
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.string().optional(),
      color: z.string().optional(),
      size: z.number().optional(),
      name: z.string().optional(),
    })
    .optional(),

  fill: z
    .object({
      color: z.string().optional(),
    })
    .optional(),

  alignment: z
    .object({
      horizontal: z.enum(["Left", "Center", "Right", "Justify"]).optional(),
      vertical: z.enum(["Top", "Middle", "Bottom"]).optional(),
      wrapText: z.boolean().optional(),
    })
    .optional(),

  borders: z
    .object({
      EdgeTop: BorderStyleSchema.optional(),
      EdgeBottom: BorderStyleSchema.optional(),
      EdgeLeft: BorderStyleSchema.optional(),
      EdgeRight: BorderStyleSchema.optional(),
      InsideHorizontal: BorderStyleSchema.optional(),
      InsideVertical: BorderStyleSchema.optional(),
      DiagonalDown: BorderStyleSchema.optional(),
      DiagonalUp: BorderStyleSchema.optional(),
    })
    .optional(),

  numberFormat: z.union([z.string(), z.array(z.array(z.string()))]).optional(),

  merge: z.boolean().optional(),

  autofitColumns: z.boolean().optional(),
});

type ExcelStyleRangeInput = z.infer<typeof ExcelStyleRangeInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelStyleRangeOutput = WorkbookHandle & {
  address: string;
  appliedFormatProps: string[];
  mergedApplied: boolean;
  autofitApplied: boolean;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelStyleRangeOptions = Readonly<{
  handle?: WorkbookHandle;
  sheet: string;
  range: string;
  font?: {
    bold?: boolean;
    italic?: boolean;
    underline?: string;
    color?: string;
    size?: number;
    name?: string;
  };
  fill?: { color?: string };
  alignment?: {
    horizontal?: "Left" | "Center" | "Right" | "Justify";
    vertical?: "Top" | "Middle" | "Bottom";
    wrapText?: boolean;
  };
  borders?: Partial<Record<BorderEdge, BorderStyle>>;
  numberFormat?: string | string[][];
  merge?: boolean;
  autofitColumns?: boolean;
}>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Graph's PATCH on `/range(...)/format` does NOT accept `font` or `fill` as nested
 * sub-objects — they live at separate sub-resources `/format/font` and `/format/fill`
 * and must be PATCHed there directly. Only alignment/wrapText/numberFormat go on the
 * top-level `/format` PATCH.
 */
function buildFormatBody(input: ExcelStyleRangeInput): { body: Record<string, unknown>; appliedFormatProps: string[] } {
  const body: Record<string, unknown> = {};
  const appliedFormatProps: string[] = [];

  if (input.alignment && Object.keys(input.alignment).length > 0) {
    if (input.alignment.horizontal !== undefined) body["horizontalAlignment"] = input.alignment.horizontal;
    if (input.alignment.vertical !== undefined) body["verticalAlignment"] = input.alignment.vertical;
    if (input.alignment.wrapText !== undefined) body["wrapText"] = input.alignment.wrapText;
    if (Object.keys(body).length > 0) appliedFormatProps.push("alignment");
  }

  if (input.numberFormat !== undefined) {
    body["numberFormat"] = input.numberFormat;
    appliedFormatProps.push("numberFormat");
  }

  return { body, appliedFormatProps };
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure execute function
// ---------------------------------------------------------------------------

export async function executeExcelStyleRange(
  session: MsGraphSession,
  cfg: ExcelStyleRangeOptions,
  itemJson: unknown,
): Promise<ExcelStyleRangeOutput> {
  const fromItem = itemJson as Partial<WorkbookHandle> | undefined;
  const candidateFromItem: WorkbookHandle | undefined =
    fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
      ? (fromItem as WorkbookHandle)
      : undefined;
  const resolvedHandle = cfg.handle ?? candidateFromItem;
  if (!resolvedHandle) {
    throw new Error(
      "ExcelStyleRangeNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
    );
  }

  const input = ExcelStyleRangeInputSchema.parse({
    handle: resolvedHandle,
    sheet: cfg.sheet,
    range: cfg.range,
    font: cfg.font,
    fill: cfg.fill,
    alignment: cfg.alignment,
    borders: cfg.borders,
    numberFormat: cfg.numberFormat,
    merge: cfg.merge,
    autofitColumns: cfg.autofitColumns,
  });

  let { handle } = input;
  const { sheet, range, borders, merge, autofitColumns } = input;
  const appliedFormatProps: string[] = [];

  // Step 1: Coalesced PATCH on range/format (alignment + numberFormat)
  const { body: formatBody, appliedFormatProps: formatProps } = buildFormatBody(input);
  if (Object.keys(formatBody).length > 0) {
    const formatResult = await workbookFetch({
      session,
      handle,
      method: "PATCH",
      path: rangeFormatPath(handle, sheet, range),
      body: formatBody,
    });
    handle = formatResult.handle;
    appliedFormatProps.push(...formatProps);
  }

  if (input.font && Object.keys(input.font).length > 0) {
    const fontResult = await workbookFetch({
      session,
      handle,
      method: "PATCH",
      path: `${rangeFormatPath(handle, sheet, range)}/font`,
      body: input.font,
    });
    handle = fontResult.handle;
    appliedFormatProps.push("font");
  }

  if (input.fill && Object.keys(input.fill).length > 0) {
    const fillResult = await workbookFetch({
      session,
      handle,
      method: "PATCH",
      path: `${rangeFormatPath(handle, sheet, range)}/fill`,
      body: input.fill,
    });
    handle = fillResult.handle;
    appliedFormatProps.push("fill");
  }

  // Step 2: Border PATCHes
  if (borders && Object.keys(borders).length > 0) {
    const borderEntries = (Object.entries(borders) as Array<[BorderEdge, BorderStyle | undefined]>).filter(
      (entry): entry is [BorderEdge, BorderStyle] => entry[1] !== undefined,
    );
    const borderResults = await Promise.all(
      borderEntries.map(([edge, borderStyle]) =>
        workbookFetch({
          session,
          handle,
          method: "PATCH",
          path: rangeBorderPath(handle, sheet, range, edge),
          body: borderStyle,
        }),
      ),
    );
    const lastBorderResult = borderResults[borderResults.length - 1];
    if (lastBorderResult) handle = lastBorderResult.handle;
    appliedFormatProps.push("borders");
  }

  // Step 3: Merge
  let mergedApplied = false;
  if (merge === true) {
    const mergeResult = await workbookFetch({
      session,
      handle,
      method: "POST",
      path: `${rangePath(handle, sheet, range)}/merge`,
      body: { across: false },
    });
    handle = mergeResult.handle;
    mergedApplied = true;
  }

  // Step 4: autofitColumns
  let autofitApplied = false;
  if (autofitColumns === true) {
    const autofitResult = await workbookFetch({
      session,
      handle,
      method: "POST",
      path: `${rangeFormatPath(handle, sheet, range)}/autofitColumns`,
    });
    handle = autofitResult.handle;
    autofitApplied = true;
  }

  return { ...handle, address: range, appliedFormatProps, mergedApplied, autofitApplied };
}

export const excelStyleRangeNode = defineNode({
  key: "msgraph-excel.style-range",
  title: "Style Excel range",
  description:
    "Apply formatting (font, fill, alignment, borders, numberFormat, merge, autofit) to a worksheet range. Issues separate PATCHes per sub-resource as required by Graph.",
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
    return executeExcelStyleRange(session, config as unknown as ExcelStyleRangeOptions, item.json);
  },
});
