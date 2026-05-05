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
// Core list function (exported for testing)
// ---------------------------------------------------------------------------

export async function listChildren(client: GraphClient, input: DriveListChildrenInput): Promise<DriveChildItem[]> {
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

  return collected;
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

export class DriveListChildren implements RunnableNodeConfig<DriveListChildrenOptions, DriveChildItem> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveListChildrenNode;
  readonly icon = "builtin:microsoft-onedrive" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveListChildrenOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const hasDrive = this.cfg.driveId?.trim();
    const hasItem = this.cfg.itemId?.trim();
    const maxItems = this.cfg.maxItems ?? 1000;
    const filterPart = this.cfg.filter ? `, filter: \`${this.cfg.filter}\`` : "";
    if (hasDrive && hasItem) {
      return `List up to ${maxItems} children of folder \`${hasItem}\` in drive \`${hasDrive}\`${filterPart}.`;
    }
    return `List up to ${maxItems} children of folder (driveId + itemId from upstream)${filterPart}.`;
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
export class DriveListChildrenNode implements RunnableNode<DriveListChildren> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveListChildren>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;
    // Fall back to item.json so DriveResolve → DriveListChildren chains without UI wiring.
    const fromItem = (args.item.json ?? {}) as { driveId?: string; itemId?: string };

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    // Parse and validate input (apply defaults)
    const input = DriveListChildrenInputSchema.parse({
      driveId: cfg.driveId || fromItem.driveId,
      itemId: cfg.itemId || fromItem.itemId,
      filter: cfg.filter,
      orderBy: cfg.orderBy,
      top: cfg.top,
      maxItems: cfg.maxItems,
    });

    const children = await listChildren(client, input);

    // Engine's NodeOutputNormalizer wraps each array element as { json: el }.
    // Truncation (when maxItems was reached) is implicit: consumers can compare
    // the output count to cfg.maxItems if they need to detect it.
    return children;
  }
}
