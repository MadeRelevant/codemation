import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function toBase64Url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function encodeDrivePath(rawPath: string): string {
  const segments = rawPath.split("/").filter(Boolean);
  return "/" + segments.map(encodeURIComponent).join("/");
}

// ---------------------------------------------------------------------------
// Input schema — discriminated union on `kind`
// ---------------------------------------------------------------------------

export const DriveResolveInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("personalPath"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sharedLink"),
    url: z.string().min(1),
  }),
  z.object({
    kind: z.literal("driveItem"),
    driveId: z.string().min(1),
    itemId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sharedWithMe"),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("byName"),
    driveId: z.string().min(1),
    parentItemId: z.string().min(1),
    name: z.string().min(1),
  }),
]);

export type DriveResolveInput = z.infer<typeof DriveResolveInputSchema>;

// ---------------------------------------------------------------------------
// Output — identical regardless of input variant
// ---------------------------------------------------------------------------

export type DriveResolveOutput = {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  isShared: boolean;
  mimeType?: string;
  size?: number;
  lastModifiedDateTime?: string;
};

// ---------------------------------------------------------------------------
// Narrow GraphClient stub (typed for testability)
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
  top(n: number): GraphApiRequest;
  filter(expr: string): GraphApiRequest;
  select(fields: string): GraphApiRequest;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Raw Graph response shapes
// ---------------------------------------------------------------------------

type RawDriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
  remoteItem?: {
    id?: string;
    name?: string;
    webUrl?: string;
    size?: number;
    lastModifiedDateTime?: string;
    file?: { mimeType?: string };
    parentReference?: { driveId?: string };
  };
};

type SharedWithMeResponse = {
  value?: RawDriveItem[];
};

type ChildrenResponse = {
  value?: RawDriveItem[];
};

// ---------------------------------------------------------------------------
// Canonical mapper
// ---------------------------------------------------------------------------

function toCanonical(item: RawDriveItem, opts: { isShared: boolean; driveIdOverride?: string }): DriveResolveOutput {
  const driveId = opts.driveIdOverride ?? item.parentReference?.driveId ?? "";
  return {
    driveId,
    itemId: item.id ?? "",
    name: item.name ?? "",
    webUrl: item.webUrl ?? "",
    isShared: opts.isShared,
    mimeType: item.file?.mimeType,
    size: item.size,
    lastModifiedDateTime: item.lastModifiedDateTime,
  };
}

// ---------------------------------------------------------------------------
// Per-variant resolvers (exported for testing)
// ---------------------------------------------------------------------------

export async function resolvePersonalPath(client: GraphClient, path: string): Promise<DriveResolveOutput> {
  const encoded = encodeDrivePath(path);
  // Graph's trailing-colon syntax (`/me/drive/root:/foo`) only works for non-empty paths.
  // For "/" (drive root) call the bare `/me/drive/root` endpoint instead.
  const url = encoded === "/" ? "/me/drive/root" : `/me/drive/root:${encoded}`;
  const raw = (await withGraphRetry(() => client.api(url).get())) as RawDriveItem;

  const driveId = raw.parentReference?.driveId ?? "";
  return toCanonical({ ...raw, id: raw.id }, { isShared: false, driveIdOverride: driveId });
}

export async function resolveSharedLink(client: GraphClient, url: string): Promise<DriveResolveOutput> {
  const token = `u!${toBase64Url(url)}`;
  const raw = (await withGraphRetry(() => client.api(`/shares/${token}/driveItem`).get())) as RawDriveItem;

  const driveId = raw.parentReference?.driveId ?? "";
  return toCanonical({ ...raw }, { isShared: true, driveIdOverride: driveId });
}

export async function resolveDriveItem(
  client: GraphClient,
  driveId: string,
  itemId: string,
): Promise<DriveResolveOutput> {
  const raw = (await withGraphRetry(() =>
    client.api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`).get(),
  )) as RawDriveItem;

  return toCanonical({ ...raw }, { isShared: false, driveIdOverride: driveId });
}

export async function resolveSharedWithMe(client: GraphClient, name: string): Promise<DriveResolveOutput> {
  const resp = (await withGraphRetry(() => client.api("/me/drive/sharedWithMe").get())) as SharedWithMeResponse;

  const entries = resp.value ?? [];
  const needle = name.toLowerCase();
  const match = entries.find((e) => (e.name ?? "").toLowerCase() === needle);

  if (!match) {
    throw new Error(
      `DriveResolveNode: no shared-with-me entry found with name "${name}". ` +
        "Check that the item has been shared with you and the name is exact.",
    );
  }

  const remote = match.remoteItem;
  if (!remote) {
    throw new Error(
      `DriveResolveNode: shared-with-me entry "${name}" has no remoteItem; ` + "pass an explicit driveItem instead.",
    );
  }

  const remoteDriveId = remote.parentReference?.driveId;
  if (!remoteDriveId) {
    throw new Error(
      `DriveResolveNode: shared-with-me entry "${name}" remoteItem is missing parentReference.driveId. ` +
        "Pass an explicit driveItem instead.",
    );
  }

  return toCanonical(
    {
      id: remote.id,
      name: remote.name ?? match.name,
      webUrl: remote.webUrl ?? match.webUrl,
      size: remote.size ?? match.size,
      lastModifiedDateTime: remote.lastModifiedDateTime ?? match.lastModifiedDateTime,
      file: remote.file ?? match.file,
    },
    { isShared: true, driveIdOverride: remoteDriveId },
  );
}

export async function resolveByName(
  client: GraphClient,
  driveId: string,
  parentItemId: string,
  name: string,
): Promise<DriveResolveOutput> {
  const escaped = escapeOData(name);
  const resp = (await withGraphRetry(() =>
    client
      .api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`)
      .filter(`name eq '${escaped}'`)
      .top(1)
      .get(),
  )) as ChildrenResponse;

  const match = resp.value?.[0];
  if (!match) {
    throw new Error(`DriveResolveNode: no child named "${name}" found in drive "${driveId}" folder "${parentItemId}".`);
  }

  return toCanonical({ ...match }, { isShared: false, driveIdOverride: driveId });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriveResolveOptions = Readonly<{
  input: DriveResolveInput;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveResolveNode = defineNode({
  key: "msgraph-drive.resolve",
  title: "Resolve drive item",
  description:
    "Resolve a OneDrive/SharePoint item by path, shared link, drive+item ids, or name search to canonical driveId + itemId.",
  icon: "builtin:microsoft-onedrive",
  inspectorSummary({ config }) {
    const cfg = config as unknown as DriveResolveOptions;
    if (!cfg.input) return undefined;
    const { input } = cfg;
    const kindValue: string = input.kind;
    const rows: Array<{ label: string; value: string }> = [{ label: "Kind", value: kindValue }];
    if (input.kind === "personalPath") rows.push({ label: "Path", value: input.path.slice(0, 80) });
    else if (input.kind === "sharedLink") rows.push({ label: "URL", value: input.url.slice(0, 80) });
    else if (input.kind === "driveItem") {
      rows.push({ label: "Drive ID", value: input.driveId.slice(0, 80) });
      rows.push({ label: "Item ID", value: input.itemId.slice(0, 80) });
    } else if (input.kind === "sharedWithMe" || input.kind === "byName") {
      rows.push({ label: "Name", value: input.name.slice(0, 80) });
    }
    return rows;
  },
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute(_, { config, credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;
    const typedConfig = config as unknown as DriveResolveOptions;
    const { input } = typedConfig;

    switch (input.kind) {
      case "personalPath":
        return await resolvePersonalPath(client, input.path);
      case "sharedLink":
        return await resolveSharedLink(client, input.url);
      case "driveItem":
        return await resolveDriveItem(client, input.driveId, input.itemId);
      case "sharedWithMe":
        return await resolveSharedWithMe(client, input.name);
      case "byName":
        return await resolveByName(client, input.driveId, input.parentItemId, input.name);
    }
  },
});
