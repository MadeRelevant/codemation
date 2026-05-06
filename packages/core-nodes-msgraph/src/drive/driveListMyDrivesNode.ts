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

type RawDrive = {
  id?: string;
  driveType?: string;
  name?: string;
  webUrl?: string;
  owner?: {
    user?: { displayName?: string; email?: string };
  };
  quota?: {
    total?: number;
    used?: number;
    remaining?: number;
  };
};

type DrivesPage = {
  value?: RawDrive[];
  "@odata.nextLink"?: string;
};

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type DriveInfo = {
  driveId: string;
  driveType: "personal" | "business" | "documentLibrary" | string;
  name: string;
  webUrl?: string;
  owner?: {
    displayName?: string;
    email?: string;
  };
  quota?: {
    total?: number;
    used?: number;
    remaining?: number;
  };
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function toDriveInfo(raw: RawDrive): DriveInfo {
  return {
    driveId: raw.id ?? "",
    driveType: raw.driveType ?? "personal",
    name: raw.name ?? "",
    webUrl: raw.webUrl,
    owner: raw.owner?.user
      ? {
          displayName: raw.owner.user.displayName,
          email: raw.owner.user.email,
        }
      : undefined,
    quota: raw.quota
      ? {
          total: raw.quota.total,
          used: raw.quota.used,
          remaining: raw.quota.remaining,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Core list function (exported for testing)
// ---------------------------------------------------------------------------

export async function listMyDrives(client: GraphClient): Promise<DriveInfo[]> {
  const drives: DriveInfo[] = [];
  let nextLink: string | undefined = undefined;
  let isFirstPage = true;

  while (true) {
    const url = isFirstPage ? "/me/drives" : nextLink!;
    const page = (await withGraphRetry(() => client.api(url).get())) as DrivesPage;

    for (const raw of page.value ?? []) {
      drives.push(toDriveInfo(raw));
    }

    nextLink = page["@odata.nextLink"];
    if (!nextLink) break;
    isFirstPage = false;
  }

  return drives;
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveListMyDrivesNode = defineNode({
  key: "msgraph-drive.list-my-drives",
  title: "List my drives",
  description: "List all drives (personal and business) accessible to the connected user.",
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
    return await listMyDrives(client);
  },
});
