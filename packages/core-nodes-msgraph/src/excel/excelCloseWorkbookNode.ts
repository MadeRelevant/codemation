import type {
  CredentialRequirement,
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
// Options
// ---------------------------------------------------------------------------

export type ExcelCloseWorkbookOptions = Readonly<{
  handle: WorkbookHandle;
}>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Close a Microsoft Graph Excel workbook session.
 *
 * This node is the mandatory counterpart to `ExcelOpenWorkbookNode`.
 * It is idempotent — calling it on an already-expired or already-closed
 * session resolves without error.
 */
export class ExcelCloseWorkbook implements RunnableNodeConfig<ExcelCloseWorkbookOptions, ExcelCloseWorkbookOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelCloseWorkbookNode;
  readonly icon = "si:microsoftexcel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelCloseWorkbookOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return "Close the Excel workbook session. Idempotent — safe to call even if the session has already expired.";
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
export class ExcelCloseWorkbookNode implements RunnableNode<ExcelCloseWorkbook> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelCloseWorkbook>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    const { handle } = ExcelCloseWorkbookInputSchema.parse({ handle: cfg.handle });

    await closeWorkbookSession({ session, handle });

    const output: ExcelCloseWorkbookOutput = { closed: true };
    return { ...args.item, json: output };
  }
}
