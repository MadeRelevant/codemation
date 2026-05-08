import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
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
  driveId: z.string().min(1),
  itemId: z.string().min(1),
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
// Types
// ---------------------------------------------------------------------------

export type DriveItemGetOptions = Readonly<{
  driveId: string;
  itemId: string;
  expand?: ExpandField[];
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveItemGetNode = defineNode({
  key: "msgraph-drive.item-get",
  title: "Get drive item",
  description: "Fetch full metadata for a drive item by driveId and itemId.",
  icon: "builtin:microsoft-onedrive",
  inspectorSummary({ config }) {
    const cfg = config as unknown as DriveItemGetOptions;
    const rows = [];
    if (cfg.driveId) rows.push({ label: "Drive ID", value: cfg.driveId.slice(0, 80) });
    if (cfg.itemId) rows.push({ label: "Item ID", value: cfg.itemId.slice(0, 80) });
    if (cfg.expand && cfg.expand.length > 0) {
      rows.push({ label: "Expand", value: cfg.expand.join(", ") });
    }
    return rows.length > 0 ? rows : undefined;
  },
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.Read.All.",
    },
  },
  async execute(_, { config, credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;

    const input = DriveItemGetInputSchema.parse({
      driveId: config.driveId,
      itemId: config.itemId,
      expand: config.expand,
    });

    return await getItem(client, input);
  },
});
