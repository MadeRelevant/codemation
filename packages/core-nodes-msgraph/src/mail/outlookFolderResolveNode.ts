import type {
  CredentialRequirement,
  Item,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphMailOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OutlookFolderResolveOptions = Readonly<{
  /** Mailbox: `"me"` / `""` / `"self"` → /me; any other value → /users/{mailbox}. */
  mailbox: string;
  /**
   * `/`-separated folder path. Examples: `"Inbox"`, `"Inbox/Receipts"`,
   * `"Inbox/Projects/2026"`, `"BoeschDev"`.
   *
   * The first segment may be a well-known folder name (case-insensitive):
   * `inbox`, `drafts`, `sentitems`, `deleteditems`, `archive`, `junkemail`, `outbox`.
   * Well-known names are used as folder ids directly — no API call required.
   * Subsequent segments always resolve by displayName lookup under the current parent.
   */
  folderPath: string;
  /**
   * When true and a segment does not exist, create it via POST.
   * When false (default), throw a descriptive error naming the unresolved segment.
   */
  createIfMissing?: boolean;
}>;

export type OutlookFolderResolveOutput = Readonly<{
  folderId: string;
  path: string;
  mailbox: string;
}>;

export class OutlookFolderResolve implements RunnableNodeConfig<
  OutlookFolderResolveOptions,
  OutlookFolderResolveOutput
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = OutlookFolderResolveNode;
  readonly icon = "builtin:microsoft-outlook" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OutlookFolderResolveOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const path = this.cfg.folderPath?.trim();
    const mailbox = this.cfg.mailbox?.trim() || "me";
    const createSuffix = this.cfg.createIfMissing ? ", creating missing segments" : "";
    return path
      ? `Resolve mail folder \`${path}\` in mailbox \`${mailbox}\` to a folder id${createSuffix}.`
      : `Resolve mail folder (path from upstream) to a folder id${createSuffix}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Well-known folder names
// The Graph API accepts these directly as folder ids on well-known names.
// Case-insensitive match.
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

/** Escape a display name for OData $filter: single quotes become two single quotes. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

type FolderListResponse = Readonly<{ value?: ReadonlyArray<{ id?: string; displayName?: string }> }>;
type FolderCreateResponse = Readonly<{ id?: string }>;

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OutlookFolderResolveNode implements RunnableNode<OutlookFolderResolve> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<OutlookFolderResolve>): Promise<unknown> {
    const { ctx } = args;
    const { cfg } = ctx.config;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);

    const prefix = mailboxPathPrefix(cfg.mailbox);
    const createIfMissing = cfg.createIfMissing ?? false;

    // Parse segments — filter out empty strings from double-slashes or leading/trailing slashes
    const rawSegments = cfg.folderPath
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
      // Well-known name: use directly as folder id (no API call).
      currentId = firstSegment.toLowerCase();
    } else {
      // Resolve by displayName under mailFolders root.
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
        if (!created?.id) {
          throw new Error(`OutlookFolderResolveNode: failed to create folder "${firstSegment}".`);
        }
        currentId = created.id;
      } else {
        throw new Error(
          `OutlookFolderResolveNode: folder "${firstSegment}" not found in mailbox "${cfg.mailbox || "me"}". ` +
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
        if (!created?.id) {
          throw new Error(`OutlookFolderResolveNode: failed to create folder "${segment}".`);
        }
        currentId = created.id;
      } else {
        const resolvedSoFar = rawSegments.slice(0, i).join("/");
        throw new Error(
          `OutlookFolderResolveNode: child folder "${segment}" not found under "${resolvedSoFar}" ` +
            `in mailbox "${cfg.mailbox || "me"}". Set createIfMissing: true to create it automatically.`,
        );
      }
    }

    const output: OutlookFolderResolveOutput = {
      folderId: currentId,
      path: rawSegments.join("/"),
      mailbox: cfg.mailbox || "me",
    };

    return { ...(args.item as Item), json: output };
  }
}
