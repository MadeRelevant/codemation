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
import { workbookPath, worksheetPath } from "./paths";

// ---------------------------------------------------------------------------
// Raw Graph response types
// ---------------------------------------------------------------------------

type RawWorksheetInfo = {
  id: string;
  name: string;
  position: number;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ExcelAddSheetInputSchema = z.object({
  handle: z.custom<WorkbookHandle>(
    (val) => val !== null && typeof val === "object" && typeof (val as WorkbookHandle).sessionId === "string",
    { message: "Expected a WorkbookHandle from ExcelOpenWorkbookNode" },
  ),
  name: z.string().min(1),
  copyFrom: z
    .object({
      sheetName: z.string().min(1),
    })
    .optional(),
});

type ExcelAddSheetInput = z.infer<typeof ExcelAddSheetInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type WorksheetDetails = {
  id: string;
  name: string;
  position: number;
};

export type ExcelAddSheetOutput = WorksheetDetails & WorkbookHandle;

// ---------------------------------------------------------------------------
// Options / Config
// ---------------------------------------------------------------------------

export type ExcelAddSheetOptions = Readonly<{
  handle?: WorkbookHandle;
  name: string;
  copyFrom?: { sheetName: string };
}>;

/**
 * Add a new worksheet to an open Excel workbook.
 *
 * Optionally copies from an existing sheet via `copyFrom.sheetName`.
 * When copying, the node first issues POST `/worksheets/{sheetName}/copy`.
 * Graph may not honour the `name` field in newer API versions; if the
 * response does not reflect the requested name, a follow-up PATCH renames
 * the sheet. This defensive rename ensures the output always matches the
 * requested name regardless of Graph API version behaviour.
 */
export class ExcelAddSheet implements RunnableNodeConfig<ExcelAddSheetOptions, ExcelAddSheetOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExcelAddSheetNode;
  readonly icon = "builtin:microsoft-excel" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: ExcelAddSheetOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    if (this.cfg.copyFrom?.sheetName) {
      return `Copy worksheet \`${this.cfg.copyFrom.sheetName}\` to new sheet \`${this.cfg.name}\`.`;
    }
    return `Create or reuse worksheet \`${this.cfg.name}\` in the open workbook.`;
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
export class ExcelAddSheetNode implements RunnableNode<ExcelAddSheet> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ExcelAddSheet>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    // Fall back to item.json so ExcelOpenWorkbook → ExcelAddSheet chains without UI handle wiring.
    // Discriminate a real WorkbookHandle (has sessionId) from plain item.json (e.g. DriveResolve output).
    const fromItem = args.item.json as Partial<WorkbookHandle> | undefined;
    const candidateFromItem: WorkbookHandle | undefined =
      fromItem && typeof fromItem.sessionId === "string" && fromItem.sessionId.length > 0
        ? (fromItem as WorkbookHandle)
        : undefined;
    const resolvedHandle = cfg.handle ?? candidateFromItem;
    if (!resolvedHandle) {
      throw new Error(
        "ExcelAddSheetNode: requires `handle` in cfg or upstream item.json (flat WorkbookHandle) from ExcelOpenWorkbookNode.",
      );
    }

    const input: ExcelAddSheetInput = ExcelAddSheetInputSchema.parse({
      handle: resolvedHandle,
      name: cfg.name,
      copyFrom: cfg.copyFrom,
    });

    let { handle } = input;
    const { name, copyFrom } = input;

    let worksheet: WorksheetDetails;

    if (copyFrom) {
      // Copy path: POST /workbook/worksheets('{sourceSheet}')/copy
      // Graph supports a `name` field on the copy request in some API versions.
      // We pass it defensively — if Graph honours it, no rename is needed.
      // If it doesn't, we fall back to a follow-up PATCH to rename.
      const copyPath = `${worksheetPath(handle, copyFrom.sheetName)}/copy`;

      const copyResult = await workbookFetch({
        session,
        handle,
        method: "POST",
        path: copyPath,
        body: {
          positionType: "End",
          // Pass the desired name — not all Graph versions honour this.
          // We'll verify and rename if necessary.
          name,
        },
      });

      handle = copyResult.handle;
      const copyBody = copyResult.json as RawWorksheetInfo;

      if (copyBody.name !== name) {
        // Defensive rename: Graph did not honour the requested name in the copy body.
        // PATCH the new worksheet by its actual name to rename it to the desired name.
        const renamePath = `${workbookPath(handle)}/worksheets('${encodeURIComponent(copyBody.name)}')`;

        const renameResult = await workbookFetch({
          session,
          handle,
          method: "PATCH",
          path: renamePath,
          body: { name },
        });

        handle = renameResult.handle;
        const renameBody = renameResult.json as RawWorksheetInfo;

        worksheet = {
          id: renameBody.id ?? copyBody.id,
          name: renameBody.name ?? name,
          position: renameBody.position ?? copyBody.position,
        };
      } else {
        worksheet = {
          id: copyBody.id,
          name: copyBody.name,
          position: copyBody.position,
        };
      }
    } else {
      // Idempotent simple add: try POST; if Graph rejects the name (already exists),
      // look up the existing worksheet by name and return that instead. Saves workflow
      // authors from having to gate this with an `if exists` branch on the canvas.
      const addPath = `${workbookPath(handle)}/worksheets/add`;

      try {
        const addResult = await workbookFetch({
          session,
          handle,
          method: "POST",
          path: addPath,
          body: { name },
        });

        handle = addResult.handle;
        const addBody = addResult.json as RawWorksheetInfo;
        worksheet = { id: addBody.id, name: addBody.name, position: addBody.position };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status !== 400 && status !== 409) throw err;

        const lookupPath = `${workbookPath(handle)}/worksheets('${encodeURIComponent(name)}')`;
        const lookupResult = await workbookFetch({ session, handle, method: "GET", path: lookupPath });
        handle = lookupResult.handle;
        const lookupBody = lookupResult.json as RawWorksheetInfo;
        worksheet = { id: lookupBody.id, name: lookupBody.name, position: lookupBody.position };
      }
    }

    const output: ExcelAddSheetOutput = {
      ...worksheet,
      ...handle,
    };

    return { ...(args.item as Item), json: output };
  }
}
