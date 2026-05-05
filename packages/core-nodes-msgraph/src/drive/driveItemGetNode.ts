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
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";
import { toCanonicalFull, type DriveItemFull, type RawChildItem } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
  expand(expr: string): GraphApiRequest;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const VALID_EXPAND = ["listItem", "permissions", "thumbnails"] as const;
type ExpandField = (typeof VALID_EXPAND)[number];

export const DriveItemGetInputSchema = z.object({
  /** Canonical drive id. */
  driveId: z.string().min(1),
  /** Canonical item id. */
  itemId: z.string().min(1),
  /**
   * Optional sub-resources to $expand. Pass-through to Graph.
   * Valid values: "listItem", "permissions", "thumbnails".
   */
  expand: z.array(z.enum(VALID_EXPAND)).optional(),
});

export type DriveItemGetInput = z.infer<typeof DriveItemGetInputSchema>;

// ---------------------------------------------------------------------------
// Output shape (re-exported from mapper)
// ---------------------------------------------------------------------------

export type { DriveItemFull } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Core get function (exported for testing)
// ---------------------------------------------------------------------------

export async function getItem(client: GraphClient, input: DriveItemGetInput): Promise<DriveItemFull> {
  const { driveId, itemId, expand } = input;

  const url = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
  let req: GraphApiRequest = client.api(url);

  if (expand && expand.length > 0) {
    req = req.expand(expand.join(","));
  }

  const raw = (await withGraphRetry(() => req.get())) as RawChildItem;

  return toCanonicalFull(raw, driveId);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DriveItemGetOptions = Readonly<{
  driveId: string;
  itemId: string;
  expand?: ExpandField[];
}>;

export class DriveItemGet implements RunnableNodeConfig<DriveItemGetOptions, DriveItemFull> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveItemGetNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveItemGetOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return `Get metadata for driveId \`${this.cfg.driveId}\` / itemId \`${this.cfg.itemId}\`.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.Read.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class DriveItemGetNode implements RunnableNode<DriveItemGet> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveItemGet>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    const input = DriveItemGetInputSchema.parse({
      driveId: cfg.driveId,
      itemId: cfg.itemId,
      expand: cfg.expand,
    });

    const output = await getItem(client, input);

    return { ...(args.item as Item), json: output };
  }
}
