import type {
  CredentialRequirement,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphDriveOAuth";
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
// Config
// ---------------------------------------------------------------------------

export type DriveListMyDrivesOptions = Readonly<Record<string, never>>;

export class DriveListMyDrives implements RunnableNodeConfig<DriveListMyDrivesOptions, DriveInfo> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveListMyDrivesNode;
  readonly icon = "builtin:microsoft-onedrive" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveListMyDrivesOptions = {},
    public readonly id?: string,
  ) {}

  get description(): string {
    return "List all drives (personal and business) accessible to the connected user.";
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
export class DriveListMyDrivesNode implements RunnableNode<DriveListMyDrives> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<DriveListMyDrives>): Promise<unknown> {
    const { ctx } = args;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;

    const drives = await listMyDrives(client);

    // Engine's NodeOutputNormalizer wraps each array element as { json: el }.
    return drives;
  }
}
