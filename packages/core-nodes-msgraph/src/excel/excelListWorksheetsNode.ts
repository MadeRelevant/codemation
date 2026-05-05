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
// Output shape
// ---------------------------------------------------------------------------

export type WorksheetInfo = {
  id: string;
  name: string;
  position: number;
  visibility: "Visible" | "Hidden" | "VeryHidden";
};

export type ExcelListWorksheetsOutput = {
  handle: WorkbookHandle;
  worksheets: WorksheetInfo[];
};

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
  handle: WorkbookHandle;
}>;

/**
 * List all worksheets in an open Excel workbook.
 *
 * Requires a `WorkbookHandle` from `ExcelOpenWorkbookNode`. The returned handle
 * should be used for subsequent Excel operations — it may differ from the input
 * handle if the session was renewed transparently.
 */
export class ExcelListWorksheets implements RunnableNodeConfig<ExcelListWorksheetsOptions, ExcelListWorksheetsOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelListWorksheetsNode;
  readonly icon = "si:microsoftexcel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelListWorksheetsOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return "List all worksheets in an open Excel workbook.";
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
export class ExcelListWorksheetsNode implements RunnableNode<ExcelListWorksheets> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelListWorksheets>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const { handle } = ExcelListWorksheetsInputSchema.parse({ handle: cfg.handle });

    const path = worksheetsCollectionPath(handle);

    const result = await workbookFetch({
      session,
      handle,
      method: "GET",
      path,
    });

    const body = result.json as WorksheetsResponse;
    const worksheets: WorksheetInfo[] = (body.value ?? []).map((ws) => ({
      id: ws.id,
      name: ws.name,
      position: ws.position,
      visibility: ws.visibility,
    }));

    const output: ExcelListWorksheetsOutput = {
      handle: result.handle,
      worksheets,
    };

    return { ...(args.item as Item), json: output };
  }
}
