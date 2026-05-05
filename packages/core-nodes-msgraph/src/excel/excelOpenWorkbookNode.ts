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
import { openWorkbookSession } from "./session";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const ExcelOpenWorkbookInputSchema = z.object({
  /** Canonical Graph drive id (use DriveResolveNode to obtain). */
  driveId: z.string().min(1),
  /** Canonical Graph item id (use DriveResolveNode to obtain). */
  itemId: z.string().min(1),
  /**
   * Whether changes made during this session should be persisted.
   * Pass `false` for read-only analysis to avoid unexpected saves.
   * Default: true.
   */
  persistChanges: z.boolean().default(true),
});

export type ExcelOpenWorkbookInput = z.infer<typeof ExcelOpenWorkbookInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ExcelOpenWorkbookOutput = WorkbookHandle;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type ExcelOpenWorkbookOptions = Readonly<{
  driveId: string;
  itemId: string;
  /** Default: true */
  persistChanges?: boolean;
}>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Open a Microsoft Graph Excel workbook session.
 *
 * Produces a {@link WorkbookHandle} that must be passed to every subsequent
 * Excel node (ExcelListWorksheets, ExcelReadRange, ExcelWriteRange, etc.).
 *
 * **IMPORTANT — resource cleanup:**
 * The handle MUST be paired with a later `ExcelCloseWorkbookNode`. There is
 * no automatic run-end cleanup. Failing to close the session leaves it open
 * on Graph's side until it times out (~7 minutes idle). This is acceptable
 * for short runs, but for high-frequency or long-running workflows you should
 * always close explicitly.
 */
export class ExcelOpenWorkbook implements RunnableNodeConfig<ExcelOpenWorkbookOptions, ExcelOpenWorkbookOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelOpenWorkbookNode;
  readonly icon = "builtin:microsoft-excel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelOpenWorkbookOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const hasItem = this.cfg.itemId?.trim();
    const readOnly = this.cfg.persistChanges === false ? ", read-only session" : "";
    return hasItem
      ? `Open Excel session for workbook \`${hasItem}\`${readOnly}.`
      : `Open Excel session for workbook (driveId + itemId from upstream)${readOnly}.`;
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
export class ExcelOpenWorkbookNode implements RunnableNode<ExcelOpenWorkbook> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelOpenWorkbook>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    // Fall back to item.json so DriveResolve(workbook) → ExcelOpenWorkbook chains without UI wiring.
    const fromItem = (args.item.json ?? {}) as { driveId?: string; itemId?: string };
    const input = ExcelOpenWorkbookInputSchema.parse({
      driveId: cfg.driveId || fromItem.driveId,
      itemId: cfg.itemId || fromItem.itemId,
      persistChanges: cfg.persistChanges,
    });

    const handle = await openWorkbookSession({
      session,
      driveId: input.driveId,
      itemId: input.itemId,
      persistChanges: input.persistChanges,
    });

    return { ...args.item, json: handle };
  }
}
