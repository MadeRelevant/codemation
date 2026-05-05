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

  /**
   * Single string for whole range, or per-row-of-cells matrix.
   */
  numberFormat: z.union([z.string(), z.array(z.array(z.string()))]).optional(),

  /**
   * Merge the range cells. Issues a separate POST request since Graph's merge
   * is on a different endpoint than the format PATCH.
   */
  merge: z.boolean().optional(),

  /**
   * Auto-fit column widths to content. Issues a separate POST request.
   * Endpoint: POST /range(address='{range}')/format/autofitColumns
   * (This is the documented Graph callable for auto-fitting columns from a
   * range's format resource — distinct from the column collection endpoint.)
   */
  autofitColumns: z.boolean().optional(),
});

type ExcelStyleRangeInput = z.infer<typeof ExcelStyleRangeInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelStyleRangeOutput = WorkbookHandle & {
  address: string;
  /** Names of the format properties that were actually applied in the PATCH. */
  appliedFormatProps: string[];
  mergedApplied: boolean;
  autofitApplied: boolean;
};

// ---------------------------------------------------------------------------
// Options / Config
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

/**
 * Apply formatting to a range of cells in an Excel worksheet.
 *
 * **Coalescing**: `font`, `fill`, `alignment`, and `numberFormat` are coalesced
 * into a SINGLE PATCH on `range/format` — Graph charges per request, not per
 * cell. Nicomet calls this 50+ times per generated sheet.
 *
 * **Borders**: The Graph REST API does not accept all borders in a single PATCH
 * on `range/format` — borders live at `/format/borders/{edgeName}` and require
 * per-edge requests. All edge PATCHes are issued concurrently via Promise.all
 * to minimise wall-clock time.
 *
 * **Merge**: Separate POST to `/range/merge` (required by Graph API design).
 *
 * **autofitColumns**: Separate POST to `/range/format/autofitColumns`
 * (Graph documented callable on the rangeFormat resource).
 */
export class ExcelStyleRange implements RunnableNodeConfig<ExcelStyleRangeOptions, ExcelStyleRangeOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelStyleRangeNode;
  readonly icon = "builtin:microsoft-excel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelStyleRangeOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const sheet = this.cfg.sheet?.trim();
    const range = this.cfg.range?.trim();
    const fmtParts: string[] = [];
    if (this.cfg.font && Object.keys(this.cfg.font).length > 0) fmtParts.push("font");
    if (this.cfg.fill && Object.keys(this.cfg.fill).length > 0) fmtParts.push("fill");
    if (this.cfg.alignment && Object.keys(this.cfg.alignment).length > 0) fmtParts.push("alignment");
    if (this.cfg.borders && Object.keys(this.cfg.borders).length > 0) fmtParts.push("borders");
    if (this.cfg.numberFormat !== undefined) fmtParts.push("numberFormat");
    if (this.cfg.merge) fmtParts.push("merge");
    if (this.cfg.autofitColumns) fmtParts.push("autofit");
    const fmtSuffix = fmtParts.length > 0 ? `: ${fmtParts.join(", ")}` : "";
    if (sheet && range) {
      return `Style range \`${sheet}!${range}\`${fmtSuffix}.`;
    }
    return `Style worksheet range (sheet/range from upstream or cfg)${fmtSuffix}.`;
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the format PATCH body from the input, including only the sub-objects
 * that were actually provided. Returns the body and the list of applied prop names.
 */
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
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class ExcelStyleRangeNode implements RunnableNode<ExcelStyleRange> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelStyleRange>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    // Fall back to item.json so ExcelOpenWorkbook → ExcelStyleRange chains without UI handle wiring.
    // Discriminate a real WorkbookHandle (has sessionId) from plain item.json (e.g. DriveResolve output).
    const fromItem = args.item.json as Partial<WorkbookHandle> | undefined;
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

    const input: ExcelStyleRangeInput = ExcelStyleRangeInputSchema.parse({
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

    // -------------------------------------------------------------------------
    // Step 1: Coalesced PATCH on range/format (font + fill + alignment + numberFormat)
    // -------------------------------------------------------------------------
    const { body: formatBody, appliedFormatProps: formatProps } = buildFormatBody(input);

    if (Object.keys(formatBody).length > 0) {
      const formatPath = rangeFormatPath(handle, sheet, range);
      const formatResult = await workbookFetch({
        session,
        handle,
        method: "PATCH",
        path: formatPath,
        body: formatBody,
      });
      handle = formatResult.handle;
      appliedFormatProps.push(...formatProps);
    }

    // font and fill are sub-resources of `/format`, not nested fields. PATCH them separately.
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

    // -------------------------------------------------------------------------
    // Step 2: Border PATCHes — per-edge by Graph API design.
    // The PATCH on `range/format` does NOT accept borders as a sub-object;
    // borders live at `/format/borders/{edgeName}`. All edges are issued
    // concurrently via Promise.all to minimise wall-clock time.
    // -------------------------------------------------------------------------
    if (borders && Object.keys(borders).length > 0) {
      const borderEntries = (Object.entries(borders) as Array<[BorderEdge, BorderStyle | undefined]>).filter(
        (entry): entry is [BorderEdge, BorderStyle] => entry[1] !== undefined,
      );

      const borderResults = await Promise.all(
        borderEntries.map(([edge, borderStyle]) => {
          const borderPath = rangeBorderPath(handle, sheet, range, edge);
          return workbookFetch({
            session,
            handle,
            method: "PATCH",
            path: borderPath,
            body: borderStyle,
          });
        }),
      );

      // Use the last handle (they should all be the same session unless renewal happened)
      const lastBorderResult = borderResults[borderResults.length - 1];
      if (lastBorderResult) {
        handle = lastBorderResult.handle;
      }

      appliedFormatProps.push("borders");
    }

    // -------------------------------------------------------------------------
    // Step 3: Merge (separate POST — required by Graph API design)
    // -------------------------------------------------------------------------
    let mergedApplied = false;
    if (merge === true) {
      const mergePath = `${rangePath(handle, sheet, range)}/merge`;
      const mergeResult = await workbookFetch({
        session,
        handle,
        method: "POST",
        path: mergePath,
        body: { across: false },
      });
      handle = mergeResult.handle;
      mergedApplied = true;
    }

    // -------------------------------------------------------------------------
    // Step 4: autofitColumns (separate POST — required by Graph API design)
    // Endpoint: POST /range(address='{range}')/format/autofitColumns
    // -------------------------------------------------------------------------
    let autofitApplied = false;
    if (autofitColumns === true) {
      const autofitPath = `${rangeFormatPath(handle, sheet, range)}/autofitColumns`;
      const autofitResult = await workbookFetch({
        session,
        handle,
        method: "POST",
        path: autofitPath,
      });
      handle = autofitResult.handle;
      autofitApplied = true;
    }

    const output: ExcelStyleRangeOutput = {
      ...handle,
      address: range,
      appliedFormatProps,
      mergedApplied,
      autofitApplied,
    };

    return { ...(args.item as Item), json: output };
  }
}
