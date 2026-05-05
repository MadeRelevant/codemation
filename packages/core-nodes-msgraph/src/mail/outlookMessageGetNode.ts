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
import type { GraphMessageRaw } from "./messageMapper";
import { mapGraphMessage } from "./messageMapper";
import type { MsGraphMailItem } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OutlookMessageGetOptions = Readonly<{
  /** Mailbox: `"me"` / `""` / `"self"` → /me; any other value → /users/{mailbox}. */
  mailbox: string;
  /** Graph message id. */
  messageId: string;
  /**
   * When true, attachment metadata (id, name, contentType, size, isInline, contentId)
   * is expanded inline on the response. Bytes are NOT fetched — same semantics as the trigger.
   */
  expandAttachments?: boolean;
}>;

const ATTACHMENT_METADATA_SELECT = "id,name,contentType,size,isInline,contentId";
const ATTACHMENT_METADATA_EXPAND = `attachments($select=${ATTACHMENT_METADATA_SELECT})`;

export class OutlookMessageGet implements RunnableNodeConfig<OutlookMessageGetOptions, MsGraphMailItem> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = OutlookMessageGetNode;
  readonly icon = "builtin:microsoft-outlook" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OutlookMessageGetOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const msgId = this.cfg.messageId?.trim();
    const mailbox = this.cfg.mailbox?.trim() || "me";
    const attachSuffix = this.cfg.expandAttachments ? " (with attachment metadata)" : "";
    return msgId
      ? `Fetch message \`${msgId}\` from mailbox \`${mailbox}\`${attachSuffix}.`
      : `Fetch message (id from upstream) from mailbox \`${mailbox}\`${attachSuffix}.`;
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
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OutlookMessageGetNode implements RunnableNode<OutlookMessageGet> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<OutlookMessageGet>): Promise<unknown> {
    const { ctx } = args;
    const { cfg } = ctx.config;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);

    const prefix = mailboxPathPrefix(cfg.mailbox);
    const messageId = encodeURIComponent(cfg.messageId);

    let request = client
      .api(`${prefix}/messages/${messageId}`)
      .select(
        "id,conversationId,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,bccRecipients,subject,body,internetMessageHeaders,hasAttachments",
      );

    if (cfg.expandAttachments) {
      request = request.expand(ATTACHMENT_METADATA_EXPAND);
    }

    const raw = (await withGraphRetry(() => request.get())) as GraphMessageRaw;
    const json: MsGraphMailItem = mapGraphMessage(raw);

    return { ...(args.item as Item), json };
  }
}
