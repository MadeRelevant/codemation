import { defineNode } from "@codemation/core";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import type { GraphMessageRaw } from "./messageMapper";
import { mapGraphMessage } from "./messageMapper";
import type { MsGraphMailItem } from "./types";

export type OutlookMessageGetOptions = Readonly<{
  mailbox: string;
  messageId: string;
  expandAttachments?: boolean;
}>;

const ATTACHMENT_METADATA_SELECT = "id,name,contentType,size,isInline,contentId";
const ATTACHMENT_METADATA_EXPAND = `attachments($select=${ATTACHMENT_METADATA_SELECT})`;

// ---------------------------------------------------------------------------
// Pure execute function (exported for testing)
// ---------------------------------------------------------------------------

export async function fetchMessage(
  client: ReturnType<typeof createGraphClient>,
  config: OutlookMessageGetOptions,
): Promise<MsGraphMailItem> {
  const prefix = mailboxPathPrefix(config.mailbox);
  const messageId = encodeURIComponent(config.messageId);

  let request = client
    .api(`${prefix}/messages/${messageId}`)
    .select(
      "id,conversationId,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,bccRecipients,subject,body,internetMessageHeaders,hasAttachments",
    );

  if (config.expandAttachments) {
    request = request.expand(ATTACHMENT_METADATA_EXPAND);
  }

  const raw = (await withGraphRetry(() => request.get())) as GraphMessageRaw;
  return mapGraphMessage(raw);
}

export const outlookMessageGetNode = defineNode({
  key: "msgraph-mail.outlook-message-get",
  title: "Get Outlook message",
  description: "Fetch a single message by id from Microsoft Graph Outlook.",
  icon: "builtin:microsoft-outlook",
  inspectorSummary({ config }) {
    const cfg = config as unknown as OutlookMessageGetOptions;
    const rows = [{ label: "Mailbox", value: String(cfg.mailbox ?? "me") }];
    if (cfg.expandAttachments) {
      rows.push({ label: "Expand attachments", value: "yes" });
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
    const config = rawConfig as unknown as OutlookMessageGetOptions;
    return fetchMessage(client, config);
  },
});
