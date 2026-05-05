/**
 * ExcelListWorksheetsNode — emits one item per worksheet.
 *
 * Handle threading: `workbookFetch` performs a one-shot session renewal on
 * session-expired errors and returns the renewed handle. Because a GET to
 * /worksheets can therefore yield a *different* handle than it received, we
 * spread the (possibly renewed) handle fields into every emitted item's json.
 * This ensures downstream Excel nodes always receive a valid handle regardless of
 * whether a transparent renewal happened during the list call.
 *
 * Per-item shape: { id, name, position, visibility, driveId, itemId, sessionId, expiresAt, cookies, persistChanges }
 */
import type {
  CredentialRequirement,
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
// Options / Config
// ---------------------------------------------------------------------------

export type ExcelListWorksheetsOptions = Readonly<{
  handle?: WorkbookHandle;
}>;

/**
 * List all worksheets in an open Excel workbook.
 *
 * Requires a `WorkbookHandle` from `ExcelOpenWorkbookNode`. Emits one item per
 * worksheet. Each item's json contains the worksheet fields spread together with
 * the handle fields — the handle may differ from the input if the session was
 * renewed transparently.
 */
export class ExcelListWorksheets implements RunnableNodeConfig<ExcelListWorksheetsOptions, WorksheetInfoWithHandle> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelListWorksheetsNode;
  readonly icon = "builtin:microsoft-excel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelListWorksheetsOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return "List all worksheets in the open workbook, emitting one item per sheet.";
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
export class ExcelListWorksheetsNode implements RunnableNode<ExcelListWorksheets> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelListWorksheets>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    // Fall back to item.json so ExcelOpenWorkbook → ExcelListWorksheets chains without UI handle wiring.
    // Discriminate a real WorkbookHandle (has sessionId) from plain item.json (e.g. DriveResolve output).
    const fromItem = args.item.json as Partial<WorkbookHandle> | undefined;
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

    const result = await workbookFetch({
      session,
      handle,
      method: "GET",
      path,
    });

    const body = result.json as WorksheetsResponse;
    // Spread the (possibly renewed) handle fields into every worksheet item so
    // downstream Excel nodes always have a valid flat handle, even after renewal.
    const renewedHandle = result.handle;
    const items: WorksheetInfoWithHandle[] = (body.value ?? []).map((ws) => ({
      id: ws.id,
      name: ws.name,
      position: ws.position,
      visibility: ws.visibility,
      ...renewedHandle,
    }));

    // Engine's NodeOutputNormalizer wraps each array element as { json: el }.
    return items;
  }
}
