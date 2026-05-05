import type {
  BinaryAttachment,
  CredentialRequirement,
  Item,
  NodeBinaryAttachmentService,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import { buildGraphFileAttachment } from "./attachmentHelpers";
import type { BinaryRef, InlineBinaryRef } from "./outlookMessageReplyNode";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OutlookMessageSendOptions = Readonly<{
  /** Mailbox: `"me"` / `""` / `"self"` → /me; any other value → /users/{mailbox}. */
  mailbox: string;
  /** To recipients (email address strings). */
  to: ReadonlyArray<string>;
  /** CC recipients (email strings). */
  cc?: ReadonlyArray<string>;
  /** BCC recipients (email strings). */
  bcc?: ReadonlyArray<string>;
  /** Email subject line. */
  subject: string;
  /** Body content. */
  body: string;
  /** Whether `body` is HTML or plain text. */
  bodyType: "html" | "text";
  /** Regular (non-inline) attachments to add from item binary slots. */
  attachments?: ReadonlyArray<BinaryRef>;
  /** Inline attachments (CID-referenced in HTML body). */
  inlineAttachments?: ReadonlyArray<InlineBinaryRef>;
  /** Message importance. */
  importance?: "low" | "normal" | "high";
  /**
   * When true: POST to `${mailboxPathPrefix}/messages` to create a draft and return its id.
   * When false (default): POST to `${mailboxPathPrefix}/sendMail` and emit `messageId: ""`.
   *
   * Note: Graph's `/sendMail` returns HTTP 202 No Content — there is no message id to return.
   * When `draftOnly: false`, the output carries `messageId: ""` and `isDraft: false`.
   */
  draftOnly?: boolean;
}>;

export type OutlookMessageSendOutput = Readonly<{
  /**
   * Draft message id when `draftOnly: true`.
   * Empty string (`""`) when `draftOnly: false` — Graph's `/sendMail` returns no id.
   */
  messageId: string;
  /** True when the message is a draft; false when it was sent via /sendMail. */
  isDraft: boolean;
}>;

export class OutlookMessageSend implements RunnableNodeConfig<OutlookMessageSendOptions, OutlookMessageSendOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = OutlookMessageSendNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OutlookMessageSendOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const mode = this.cfg.draftOnly ? "Create draft to" : "Send to";
    const recipients = this.cfg.to.join(", ") || "(no recipients)";
    return `${mode} ${recipients}: ${this.cfg.subject || "(no subject)"}`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGraphRecipients(emails: ReadonlyArray<string>): ReadonlyArray<unknown> {
  return emails.map((address) => ({ emailAddress: { address } }));
}

async function collectAttachments(
  binary: NodeBinaryAttachmentService,
  item: Item,
  regularRefs: ReadonlyArray<BinaryRef> | undefined,
  inlineRefs: ReadonlyArray<InlineBinaryRef> | undefined,
): Promise<ReadonlyArray<unknown>> {
  const result: unknown[] = [];

  for (const ref of regularRefs ?? []) {
    const binaryAttachment = (item.binary as Record<string, BinaryAttachment> | undefined)?.[ref.slot];
    if (!binaryAttachment) continue;
    result.push(await buildGraphFileAttachment(binary, binaryAttachment, ref.name));
  }

  for (const ref of inlineRefs ?? []) {
    const binaryAttachment = (item.binary as Record<string, BinaryAttachment> | undefined)?.[ref.slot];
    if (!binaryAttachment) continue;
    result.push(await buildGraphFileAttachment(binary, binaryAttachment, ref.name, true, ref.contentId));
  }

  return result;
}

function buildMessageBody(
  cfg: OutlookMessageSendOptions,
  attachments: ReadonlyArray<unknown>,
): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    subject: cfg.subject,
    body: {
      contentType: cfg.bodyType === "html" ? "html" : "text",
      content: cfg.body,
    },
    toRecipients: toGraphRecipients(cfg.to),
  };

  if (cfg.cc && cfg.cc.length > 0) {
    msg["ccRecipients"] = toGraphRecipients(cfg.cc);
  }
  if (cfg.bcc && cfg.bcc.length > 0) {
    msg["bccRecipients"] = toGraphRecipients(cfg.bcc);
  }
  if (cfg.importance !== undefined) {
    msg["importance"] = cfg.importance;
  }
  if (attachments.length > 0) {
    msg["attachments"] = attachments;
  }

  return msg;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OutlookMessageSendNode implements RunnableNode<OutlookMessageSend> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<OutlookMessageSend>): Promise<unknown> {
    const { ctx } = args;
    const { cfg } = ctx.config;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);
    const binary = ctx.binary;
    const prefix = mailboxPathPrefix(cfg.mailbox);

    // Read attachment bytes from binary storage (never from item JSON)
    const attachments = await collectAttachments(binary, args.item as Item, cfg.attachments, cfg.inlineAttachments);
    const message = buildMessageBody(cfg, attachments);

    let output: OutlookMessageSendOutput;

    if (cfg.draftOnly) {
      // Create a draft message — returns the draft with its id
      const draft = (await withGraphRetry(() => client.api(`${prefix}/messages`).post(message))) as { id?: string };

      const draftId = draft?.id ?? "";
      output = { messageId: draftId, isDraft: true };
    } else {
      // Send immediately via /sendMail — Graph returns 202 No Content (no message id)
      await withGraphRetry(() =>
        client.api(`${prefix}/sendMail`).post({
          message,
          saveToSentItems: true,
        }),
      );
      // Graph /sendMail returns no id — emit empty string as documented
      output = { messageId: "", isDraft: false };
    }

    return { ...(args.item as Item), json: output };
  }
}
