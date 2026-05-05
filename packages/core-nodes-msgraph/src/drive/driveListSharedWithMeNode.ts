import type {
  CredentialRequirement,
  Item,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Raw Graph response shapes
// ---------------------------------------------------------------------------

type RawRemoteItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: Record<string, unknown>;
  parentReference?: { driveId?: string };
};

type RawSharedItem = {
  id?: string;
  name?: string;
  remoteItem?: RawRemoteItem;
  shared?: {
    sharedBy?: {
      user?: { displayName?: string; email?: string };
    };
  };
};

type SharedWithMePage = {
  value?: RawSharedItem[];
  "@odata.nextLink"?: string;
};

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type SharedWithMeItem = {
  driveId: string;
  itemId: string;
  name: string;
  webUrl?: string;
  sharedBy?: {
    displayName?: string;
    email?: string;
  };
  mimeType?: string;
  isFolder: boolean;
};

export type DriveListSharedWithMeOutput = {
  items: SharedWithMeItem[];
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Map a raw sharedWithMe entry to the canonical output shape.
 * Returns undefined when the entry has no remoteItem — these entries cannot
 * be addressed canonically and are skipped rather than failing the whole list.
 */
function toSharedItem(raw: RawSharedItem): SharedWithMeItem | undefined {
  const remote = raw.remoteItem;
  if (!remote) return undefined;

  // Always use the remote item's ids — NOT the local stub's ids.
  const driveId = remote.parentReference?.driveId;
  const itemId = remote.id;

  if (!driveId || !itemId) return undefined;

  return {
    driveId,
    itemId,
    name: remote.name ?? raw.name ?? "",
    webUrl: remote.webUrl,
    sharedBy: raw.shared?.sharedBy?.user
      ? {
          displayName: raw.shared.sharedBy.user.displayName,
          email: raw.shared.sharedBy.user.email,
        }
      : undefined,
    mimeType: remote.file?.mimeType,
    isFolder: Boolean(remote.folder),
  };
}

// ---------------------------------------------------------------------------
// Core list function (exported for testing)
// ---------------------------------------------------------------------------

export async function listSharedWithMe(client: GraphClient): Promise<DriveListSharedWithMeOutput> {
  const items: SharedWithMeItem[] = [];
  let nextLink: string | undefined = undefined;
  let isFirstPage = true;

  while (true) {
    const url = isFirstPage ? "/me/drive/sharedWithMe" : nextLink!;
    const page = (await withGraphRetry(() => client.api(url).get())) as SharedWithMePage;

    for (const raw of page.value ?? []) {
      const mapped = toSharedItem(raw);
      if (mapped !== undefined) {
        items.push(mapped);
      }
    }

    nextLink = page["@odata.nextLink"];
    if (!nextLink) break;
    isFirstPage = false;
  }

  return { items };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DriveListSharedWithMeOptions = Readonly<Record<string, never>>;

export class DriveListSharedWithMe implements RunnableNodeConfig<
  DriveListSharedWithMeOptions,
  DriveListSharedWithMeOutput
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveListSharedWithMeNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveListSharedWithMeOptions = {},
    public readonly id?: string,
  ) {}

  get description(): string {
    return "List all drive items shared with the authenticated user, using canonical remote ids.";
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
export class DriveListSharedWithMeNode implements RunnableNode<DriveListSharedWithMe> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveListSharedWithMe>): Promise<unknown> {
    const { ctx } = args;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    const output = await listSharedWithMe(client);

    return { ...(args.item as Item), json: output };
  }
}
