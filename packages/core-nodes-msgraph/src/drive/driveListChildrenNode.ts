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
import { toCanonicalChild, type DriveChildItem, type RawChildItem } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
  top(n: number): GraphApiRequest;
  filter(expr: string): GraphApiRequest;
  orderby(expr: string): GraphApiRequest;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Raw Graph response shapes
// ---------------------------------------------------------------------------

type ChildrenPage = {
  value?: RawChildItem[];
  "@odata.nextLink"?: string;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const DriveListChildrenInputSchema = z.object({
  /** Canonical drive id. */
  driveId: z.string().min(1),
  /**
   * Canonical item id of the folder, or the literal string "root" for the
   * drive root (Graph supports /drives/{driveId}/root/children).
   */
  itemId: z.string().min(1),
  /** OData $filter expression, e.g. "startsWith(name,'Stock')". */
  filter: z.string().optional(),
  /** OData $orderby expression, e.g. "lastModifiedDateTime desc". */
  orderBy: z.string().optional(),
  /** Graph page size (max 200, Graph default). Applied to the first page only; subsequent pages use the nextLink. */
  top: z.number().int().min(1).max(200).default(200),
  /** Maximum total items to return across all pages. Default 1000. */
  maxItems: z.number().int().min(1).default(1000),
});

export type DriveListChildrenInput = z.infer<typeof DriveListChildrenInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type DriveListChildrenOutput = {
  /** The collected child items. */
  items: DriveChildItem[];
  /**
   * True when the fetch stopped early because `maxItems` was reached and
   * more pages were still available.
   */
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// Core list function (exported for testing)
// ---------------------------------------------------------------------------

export async function listChildren(
  client: GraphClient,
  input: DriveListChildrenInput,
): Promise<DriveListChildrenOutput> {
  const { driveId, itemId, filter, orderBy, top, maxItems } = input;

  // Build the initial URL: root shorthand or regular items path
  const basePath =
    itemId === "root"
      ? `/drives/${encodeURIComponent(driveId)}/root/children`
      : `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children`;

  // Build the first request with query params
  let req: GraphApiRequest = client.api(basePath).top(top);
  if (filter) req = req.filter(filter);
  if (orderBy) req = req.orderby(orderBy);

  const collected: DriveChildItem[] = [];
  let truncated = false;

  // Fetch pages until maxItems reached or no more nextLink
  let currentReq: GraphApiRequest | null = req;
  let nextLink: string | undefined;

  while (true) {
    const page = (await withGraphRetry(() =>
      currentReq !== null ? currentReq.get() : client.api(nextLink!).get(),
    )) as ChildrenPage;

    const items = page.value ?? [];
    for (const raw of items) {
      if (collected.length >= maxItems) {
        truncated = true;
        break;
      }
      collected.push(toCanonicalChild(raw, driveId));
    }

    if (truncated) break;

    nextLink = page["@odata.nextLink"];
    if (!nextLink) break;

    // For subsequent pages, use the raw nextLink URL (includes all query params from Graph)
    currentReq = null;
  }

  return { items: collected, truncated };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DriveListChildrenOptions = Readonly<{
  driveId: string;
  itemId: string;
  filter?: string;
  orderBy?: string;
  top?: number;
  maxItems?: number;
}>;

export class DriveListChildren implements RunnableNodeConfig<DriveListChildrenOptions, DriveListChildrenOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveListChildrenNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveListChildrenOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return `List children of folder \`${this.cfg.itemId}\` in drive \`${this.cfg.driveId}\`.`;
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
export class DriveListChildrenNode implements RunnableNode<DriveListChildren> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveListChildren>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    // Parse and validate input (apply defaults)
    const input = DriveListChildrenInputSchema.parse({
      driveId: cfg.driveId,
      itemId: cfg.itemId,
      filter: cfg.filter,
      orderBy: cfg.orderBy,
      top: cfg.top,
      maxItems: cfg.maxItems,
    });

    const output = await listChildren(client, input);

    return { ...(args.item as Item), json: output };
  }
}
