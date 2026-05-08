import { defineNode } from "@codemation/core";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";

export type OutlookMessagePatchOptions = Readonly<{
  mailbox: string;
  messageId: string;
  categories?: ReadonlyArray<string>;
  isRead?: boolean;
  move?: Readonly<{ folderId: string }>;
}>;

export type OutlookMessagePatchOutput = Readonly<{
  messageId: string;
  moved: boolean;
}>;

// ---------------------------------------------------------------------------
// Pure execute function (exported for testing)
// ---------------------------------------------------------------------------

export async function patchMessage(
  client: ReturnType<typeof createGraphClient>,
  config: OutlookMessagePatchOptions,
): Promise<OutlookMessagePatchOutput> {
  const prefix = mailboxPathPrefix(config.mailbox);
  let currentId = config.messageId;

  const patchBody: Record<string, unknown> = {};
  if (config.categories !== undefined) patchBody["categories"] = [...config.categories];
  if (config.isRead !== undefined) patchBody["isRead"] = config.isRead;

  if (Object.keys(patchBody).length > 0) {
    await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(currentId)}`).patch(patchBody));
  }

  let moved = false;
  if (config.move) {
    const moveResult = (await withGraphRetry(() =>
      client
        .api(`${prefix}/messages/${encodeURIComponent(currentId)}/move`)
        .post({ destinationId: config.move!.folderId }),
    )) as { id?: string };
    if (moveResult?.id) currentId = moveResult.id;
    moved = true;
  }

  return { messageId: currentId, moved };
}

export const outlookMessagePatchNode = defineNode({
  key: "msgraph-mail.outlook-message-patch",
  title: "Patch Outlook message",
  description: "Update message properties (isRead, categories) and optionally move to a folder.",
  icon: "builtin:microsoft-outlook",
  inspectorSummary({ config }) {
    const cfg = config as unknown as OutlookMessagePatchOptions;
    const rows = [{ label: "Mailbox", value: String(cfg.mailbox ?? "me") }];
    if (cfg.categories && cfg.categories.length > 0) {
      rows.push({ label: "Categories", value: cfg.categories.join(", ").slice(0, 80) });
    }
    if (cfg.isRead !== undefined) {
      rows.push({ label: "Mark as read", value: cfg.isRead ? "yes" : "no" });
    }
    if (cfg.move?.folderId) {
      rows.push({ label: "Move to folder", value: cfg.move.folderId.slice(0, 80) });
    }
    return rows;
  },
  credentials: {
    auth: {
      type: msGraphMailOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
    },
  },
  async execute(_, { config: rawConfig, credentials }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session);
    const config = rawConfig as unknown as OutlookMessagePatchOptions;
    return patchMessage(client, config);
  },
});
