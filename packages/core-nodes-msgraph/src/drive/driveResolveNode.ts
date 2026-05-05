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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * RFC 4648 §5 base64url encoding (no padding).
 * Used by the sharedLink variant to build the `u!{base64url(url)}` share token.
 */
function toBase64Url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Escape a string value for OData $filter single-quote delimiters.
 * Single quotes become two consecutive single quotes.
 */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Encode a drive path for the Graph "root:{path}" syntax.
 * Slashes are preserved as path separators; all other characters are percent-encoded
 * segment-by-segment so spaces and non-ASCII are safe.
 *
 * Accepts paths with or without a leading `/`; always returns one starting with `/`.
 */
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
    /** Absolute path under the user's drive root, e.g. "/Documents/foo.xlsx". */
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sharedLink"),
    /** SharePoint / OneDrive sharing URL. */
    url: z.string().min(1),
  }),
  z.object({
    kind: z.literal("driveItem"),
    /** Drive id (from a previous resolve or enumeration). */
    driveId: z.string().min(1),
    /** Item id within that drive. */
    itemId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sharedWithMe"),
    /** Display name of the shared item (case-insensitive match). */
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("byName"),
    /** Drive containing the parent folder. */
    driveId: z.string().min(1),
    /** Item id of the parent folder to search within. */
    parentItemId: z.string().min(1),
    /** Display name to match (exact, case-sensitive per Graph). */
    name: z.string().min(1),
  }),
]);

export type DriveResolveInput = z.infer<typeof DriveResolveInputSchema>;

// ---------------------------------------------------------------------------
// Output — identical regardless of input variant
// ---------------------------------------------------------------------------

export type DriveResolveOutput = {
  /** Canonical drive id (always valid with /drives/{driveId}/... addressing). */
  driveId: string;
  /** Canonical item id within that drive. */
  itemId: string;
  /** Display name of the resolved item. */
  name: string;
  /** Web URL for the item in the browser. */
  webUrl: string;
  /**
   * True for variants that resolve a link or shared-with-me entry;
   * false for personalPath, driveItem, and byName.
   */
  isShared: boolean;
  /** MIME type from `file.mimeType`, absent for folders. */
  mimeType?: string;
  /** Size in bytes; absent for folders and when Graph omits it. */
  size?: number;
  /** ISO-8601 last-modified timestamp. */
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

/**
 * Map a raw Graph driveItem response to the canonical DriveResolveOutput shape.
 * Always produces all optional fields (possibly undefined) so the key set is stable.
 */
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
// Per-variant resolvers
// ---------------------------------------------------------------------------

async function resolvePersonalPath(client: GraphClient, path: string): Promise<DriveResolveOutput> {
  const encoded = encodeDrivePath(path);
  // Graph trailing-colon path syntax: /me/drive/root:/path/to/item
  const raw = (await withGraphRetry(() => client.api(`/me/drive/root:${encoded}`).get())) as RawDriveItem;

  const driveId = raw.parentReference?.driveId ?? "";
  return toCanonical({ ...raw, id: raw.id }, { isShared: false, driveIdOverride: driveId });
}

async function resolveSharedLink(client: GraphClient, url: string): Promise<DriveResolveOutput> {
  const token = `u!${toBase64Url(url)}`;
  const raw = (await withGraphRetry(() => client.api(`/shares/${token}/driveItem`).get())) as RawDriveItem;

  const driveId = raw.parentReference?.driveId ?? "";
  return toCanonical({ ...raw }, { isShared: true, driveIdOverride: driveId });
}

async function resolveDriveItem(client: GraphClient, driveId: string, itemId: string): Promise<DriveResolveOutput> {
  const raw = (await withGraphRetry(() =>
    client.api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`).get(),
  )) as RawDriveItem;

  return toCanonical({ ...raw }, { isShared: false, driveIdOverride: driveId });
}

async function resolveSharedWithMe(client: GraphClient, name: string): Promise<DriveResolveOutput> {
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

  // Use remote ids — NOT the local stub's ids. This is the n8n footgun we're fixing.
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

async function resolveByName(
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
// Config
// ---------------------------------------------------------------------------

export type DriveResolveOptions = Readonly<{
  /** Discriminated-union input describing how to locate the drive item. */
  input: DriveResolveInput;
}>;

export class DriveResolve implements RunnableNodeConfig<DriveResolveOptions, DriveResolveOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveResolveNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveResolveOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const { input } = this.cfg;
    switch (input.kind) {
      case "personalPath":
        return `Resolve personal drive path \`${input.path}\` to canonical driveId + itemId.`;
      case "sharedLink":
        return `Resolve shared link URL to canonical driveId + itemId.`;
      case "driveItem":
        return `Validate and return metadata for driveId \`${input.driveId}\` / itemId \`${input.itemId}\`.`;
      case "sharedWithMe":
        return `Resolve shared-with-me entry \`${input.name}\` to canonical driveId + itemId.`;
      case "byName":
        return `Find child \`${input.name}\` in folder \`${input.parentItemId}\` and return canonical ids.`;
      default:
        return "Resolve a drive item to canonical driveId + itemId.";
    }
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
export class DriveResolveNode implements RunnableNode<DriveResolve> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveResolve>): Promise<unknown> {
    const { ctx } = args;
    const { input } = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    let output: DriveResolveOutput;

    switch (input.kind) {
      case "personalPath":
        output = await resolvePersonalPath(client, input.path);
        break;
      case "sharedLink":
        output = await resolveSharedLink(client, input.url);
        break;
      case "driveItem":
        output = await resolveDriveItem(client, input.driveId, input.itemId);
        break;
      case "sharedWithMe":
        output = await resolveSharedWithMe(client, input.name);
        break;
      case "byName":
        output = await resolveByName(client, input.driveId, input.parentItemId, input.name);
        break;
    }

    return { ...(args.item as Item), json: output };
  }
}
