import { defineNode } from "@codemation/core";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
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

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function toSharedItem(raw: RawSharedItem): SharedWithMeItem | undefined {
  const remote = raw.remoteItem;
  if (!remote) return undefined;

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

export async function listSharedWithMe(client: GraphClient): Promise<SharedWithMeItem[]> {
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

  return items;
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveListSharedWithMeNode = defineNode({
  key: "msgraph-drive.list-shared-with-me",
  title: "List shared with me",
  description: "List items shared with the connected user, emitting canonical remote driveId + itemId.",
  icon: "builtin:microsoft-onedrive",
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute(_, { credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;
    // Engine wraps each array element as { json: el }
    return await listSharedWithMe(client);
  },
});
