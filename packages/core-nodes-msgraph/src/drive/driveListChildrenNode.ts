import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
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
  driveId: z.string().min(1),
  itemId: z.string().min(1),
  filter: z.string().optional(),
  orderBy: z.string().optional(),
  top: z.number().int().min(1).max(200).default(200),
  maxItems: z.number().int().min(1).default(1000),
});

export type DriveListChildrenInput = z.infer<typeof DriveListChildrenInputSchema>;

// ---------------------------------------------------------------------------
// Core list function (exported for testing)
// ---------------------------------------------------------------------------

export async function listChildren(client: GraphClient, input: DriveListChildrenInput): Promise<DriveChildItem[]> {
  const { driveId, itemId, filter, orderBy, top, maxItems } = input;

  const basePath =
    itemId === "root"
      ? `/drives/${encodeURIComponent(driveId)}/root/children`
      : `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children`;

  let req: GraphApiRequest = client.api(basePath).top(top);
  if (filter) req = req.filter(filter);
  if (orderBy) req = req.orderby(orderBy);

  const collected: DriveChildItem[] = [];
  let truncated = false;

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

    currentReq = null;
  }

  return collected;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriveListChildrenOptions = Readonly<{
  driveId: string;
  itemId: string;
  filter?: string;
  orderBy?: string;
  top?: number;
  maxItems?: number;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveListChildrenNode = defineNode({
  key: "msgraph-drive.list-children",
  title: "List drive folder children",
  description: "List children of a drive folder, with optional OData filtering and paging.",
  icon: "builtin:microsoft-onedrive",
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute({ item }, { config, credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;

    // Fall back to item.json so DriveResolve → DriveListChildren chains without UI wiring.
    const fromItem = (item.json ?? {}) as { driveId?: string; itemId?: string };

    const input = DriveListChildrenInputSchema.parse({
      driveId: config.driveId || fromItem.driveId,
      itemId: config.itemId || fromItem.itemId,
      filter: config.filter,
      orderBy: config.orderBy,
      top: config.top,
      maxItems: config.maxItems,
    });

    // Engine's NodeOutputNormalizer wraps each array element as { json: el }.
    return await listChildren(client, input);
  },
});
