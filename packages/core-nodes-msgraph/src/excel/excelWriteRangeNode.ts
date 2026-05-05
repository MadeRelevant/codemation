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
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphOAuth";
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
  /** Range address like "A1:B10". Required unless appendBelow is true. */
  range: z.string().optional(),
  /** 2D array of values to write. */
  values: z.array(z.array(z.unknown())).min(1),
  /**
   * When true, ignore `range` and append the data below the current used range.
   * Resolves the next empty row from usedRange.rowCount and writes starting there.
   */
  appendBelow: z.boolean().default(false),
});

type ExcelWriteRangeInput = z.infer<typeof ExcelWriteRangeInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelWriteRangeOutput = {
  handle: WorkbookHandle;
  address: string;
  rowCount: number;
  columnCount: number;
};

// ---------------------------------------------------------------------------
// Options / Config
// ---------------------------------------------------------------------------

export type ExcelWriteRangeOptions = Readonly<{
  handle: WorkbookHandle;
  sheet: string;
  range?: string;
  values: unknown[][];
  appendBelow?: boolean;
}>;

/**
 * Write values into a range of a worksheet.
 *
 * A single PATCH request is used — never per-cell. When `appendBelow: true`,
 * two requests are made: a GET to find the current used range, then a PATCH
 * to write at the next empty row.
 */
export class ExcelWriteRange implements RunnableNodeConfig<ExcelWriteRangeOptions, ExcelWriteRangeOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelWriteRangeNode;
  readonly icon = "si:microsoftexcel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelWriteRangeOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    if (this.cfg.appendBelow) {
      return `Append rows below used range in worksheet \`${this.cfg.sheet}\`.`;
    }
    return `Write to range \`${this.cfg.range ?? "?"}\` in worksheet \`${this.cfg.sheet}\`.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class ExcelWriteRangeNode implements RunnableNode<ExcelWriteRange> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelWriteRange>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    const input: ExcelWriteRangeInput = ExcelWriteRangeInputSchema.parse({
      handle: cfg.handle,
      sheet: cfg.sheet,
      range: cfg.range,
      values: cfg.values,
      appendBelow: cfg.appendBelow,
    });

    const { values, sheet, appendBelow } = input;
    let { handle } = input;

    let targetRange: string;

    if (appendBelow) {
      // Step 1: GET usedRange to find the next empty row
      const usedRangeResult = await workbookFetch({
        session,
        handle,
        method: "GET",
        path: usedRangePath(handle, sheet, false),
        query: { $select: "address,rowCount,columnCount" },
      });

      // Update handle in case session was renewed
      handle = usedRangeResult.handle;

      const usedRangeBody = usedRangeResult.json as UsedRangeAddressResponse;
      const nextRow = usedRangeBody.rowCount + 1;

      // Compute the target column letters from the values width
      const numCols = values[0]?.length ?? 1;
      const startCol = "A";
      const endCol = columnNumberToLetter(numCols);
      const endRow = nextRow + values.length - 1;

      targetRange = `${startCol}${nextRow}:${endCol}${endRow}`;
    } else {
      if (!input.range) {
        throw new Error("ExcelWriteRangeNode: `range` is required when `appendBelow` is false.");
      }
      targetRange = input.range;
    }

    // Step 2 (or only step): PATCH the target range
    const writePath = rangePath(handle, sheet, targetRange);
    const writeResult = await workbookFetch({
      session,
      handle,
      method: "PATCH",
      path: writePath,
      body: { values },
    });

    const writeBody = writeResult.json as WriteRangeResponse;

    const output: ExcelWriteRangeOutput = {
      handle: writeResult.handle,
      address: writeBody.address ?? targetRange,
      rowCount: writeBody.rowCount ?? values.length,
      columnCount: writeBody.columnCount ?? values[0]?.length ?? 0,
    };

    return { ...(args.item as Item), json: output };
  }
}
