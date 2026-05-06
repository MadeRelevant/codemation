import { defineNode } from "@codemation/core";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";

export type OutlookFolderResolveOptions = Readonly<{
  mailbox: string;
  folderPath: string;
  createIfMissing?: boolean;
}>;

export type OutlookFolderResolveOutput = Readonly<{
  folderId: string;
  path: string;
  mailbox: string;
}>;

// ---------------------------------------------------------------------------
// Well-known folder names
// ---------------------------------------------------------------------------

const WELL_KNOWN_FOLDER_NAMES = new Set([
  "inbox",
  "drafts",
  "sentitems",
  "deleteditems",
  "archive",
  "junkemail",
  "outbox",
  "clutter",
  "conflicts",
  "conversationhistory",
  "localfailures",
  "msgfolderroot",
  "recoverableitemsdeletions",
  "scheduled",
  "searchfolders",
  "serverfailures",
  "syncissues",
]);

function isWellKnownName(name: string): boolean {
  return WELL_KNOWN_FOLDER_NAMES.has(name.toLowerCase());
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

type FolderListResponse = Readonly<{ value?: ReadonlyArray<{ id?: string; displayName?: string }> }>;
type FolderCreateResponse = Readonly<{ id?: string }>;

// ---------------------------------------------------------------------------
// Pure execute function (exported for testing)
// ---------------------------------------------------------------------------

export type GraphClientLike = ReturnType<typeof createGraphClient>;

export async function resolveFolderPath(
  client: GraphClientLike,
  config: OutlookFolderResolveOptions,
): Promise<OutlookFolderResolveOutput> {
  const prefix = mailboxPathPrefix(config.mailbox);
  const createIfMissing = config.createIfMissing ?? false;

  const rawSegments = config.folderPath
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rawSegments.length === 0) {
    throw new Error("OutlookFolderResolveNode: folderPath is empty — provide at least one segment.");
  }

  let currentId: string;

  // --- First segment ---
  const firstSegment = rawSegments[0]!;
  if (isWellKnownName(firstSegment)) {
    currentId = firstSegment.toLowerCase();
  } else {
    const escaped = escapeODataString(firstSegment);
    const resp = (await withGraphRetry(() =>
      client.api(`${prefix}/mailFolders`).filter(`displayName eq '${escaped}'`).select("id,displayName").top(1).get(),
    )) as FolderListResponse;
    const found = resp.value?.[0];
    if (found?.id) {
      currentId = found.id;
    } else if (createIfMissing) {
      const created = (await withGraphRetry(() =>
        client.api(`${prefix}/mailFolders`).post({ displayName: firstSegment }),
      )) as FolderCreateResponse;
      if (!created?.id) throw new Error(`OutlookFolderResolveNode: failed to create folder "${firstSegment}".`);
      currentId = created.id;
    } else {
      throw new Error(
        `OutlookFolderResolveNode: folder "${firstSegment}" not found in mailbox "${config.mailbox || "me"}". ` +
          `Set createIfMissing: true to create it automatically.`,
      );
    }
  }

  // --- Subsequent segments ---
  for (let i = 1; i < rawSegments.length; i++) {
    const segment = rawSegments[i]!;
    const escaped = escapeODataString(segment);
    const resp = (await withGraphRetry(() =>
      client
        .api(`${prefix}/mailFolders/${encodeURIComponent(currentId)}/childFolders`)
        .filter(`displayName eq '${escaped}'`)
        .select("id,displayName")
        .top(1)
        .get(),
    )) as FolderListResponse;
    const found = resp.value?.[0];
    if (found?.id) {
      currentId = found.id;
    } else if (createIfMissing) {
      const created = (await withGraphRetry(() =>
        client
          .api(`${prefix}/mailFolders/${encodeURIComponent(currentId)}/childFolders`)
          .post({ displayName: segment }),
      )) as FolderCreateResponse;
      if (!created?.id) throw new Error(`OutlookFolderResolveNode: failed to create folder "${segment}".`);
      currentId = created.id;
    } else {
      const resolvedSoFar = rawSegments.slice(0, i).join("/");
      throw new Error(
        `OutlookFolderResolveNode: child folder "${segment}" not found under "${resolvedSoFar}" ` +
          `in mailbox "${config.mailbox || "me"}". Set createIfMissing: true to create it automatically.`,
      );
    }
  }

  return {
    folderId: currentId,
    path: rawSegments.join("/"),
    mailbox: config.mailbox || "me",
  };
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const outlookFolderResolveNode = defineNode({
  key: "msgraph-mail.outlook-folder-resolve",
  title: "Resolve Outlook folder",
  description: "Resolve a mail folder path to its Graph folder id, optionally creating missing segments.",
  icon: "builtin:microsoft-outlook",
  credentials: {
    auth: {
      type: msGraphMailOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
    },
  },
  async execute(_, { config: rawConfig, credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const config = rawConfig as unknown as OutlookFolderResolveOptions;
    const client = createGraphClient(session);
    return resolveFolderPath(client, config);
  },
});
