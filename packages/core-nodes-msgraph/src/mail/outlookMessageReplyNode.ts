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
import { MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphMailOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import type { Recipient } from "../lib/filterMailRecipients";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import { buildGraphFileAttachment } from "./attachmentHelpers";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Reference to a binary attachment stored in the item binary slot. */
export type BinaryRef = Readonly<{
  /** The binary slot key on the item (i.e. the key under `item.binary`). */
  slot: string;
  /** Filename to use in the Graph attachment body. */
  name: string;
}>;

/** An inline attachment — embedded in the HTML body via CID reference. */
export type InlineBinaryRef = Readonly<{
  /** The binary slot key on the item. */
  slot: string;
  /** Filename to use in the Graph attachment body. */
  name: string;
  /** Content-ID value (without angle brackets) matching the `cid:` reference in the HTML body. */
  contentId: string;
}>;

export type OutlookMessageReplyOptions = Readonly<{
  /** Mailbox: `"me"` / `""` / `"self"` → /me; any other value → /users/{mailbox}. */
  mailbox: string;
  /** The message id to reply to / forward. */
  messageId: string;
  /** Reply body content. */
  body: string;
  /** Whether `body` is HTML or plain text. */
  bodyType: "html" | "text";
  /**
   * Forward mode. When true, creates a forward draft via `createForward`.
   * `to` must be non-empty. Mutually exclusive with `replyAll`.
   */
  forward?: boolean;
  /**
   * Reply-all mode. When true, uses `createReplyAll` instead of `createReply`.
   * Mutually exclusive with `forward`.
   */
  replyAll?: boolean;
  /**
   * Override the To recipients on the draft. When provided (even empty) these
   * replace the draft's auto-populated To list.
   * Elements are email address strings; they are converted to Graph `Recipient` form.
   */
  to?: ReadonlyArray<string>;
  /** CC recipients (email strings). */
  cc?: ReadonlyArray<string>;
  /** BCC recipients (email strings). */
  bcc?: ReadonlyArray<string>;
  /** Regular (non-inline) attachments to add from item binary slots. */
  attachments?: ReadonlyArray<BinaryRef>;
  /** Inline attachments (CID-referenced in HTML body). */
  inlineAttachments?: ReadonlyArray<InlineBinaryRef>;
  /**
   * When provided, applied to the `to`, `cc`, and `bcc` lists BEFORE the PATCH call.
   * Receives the full `Recipient[]` and returns the filtered/transformed list.
   * Default: identity (no filtering).
   */
  filterRecipients?: (recipients: ReadonlyArray<Recipient>) => ReadonlyArray<Recipient>;
  /** Message importance. */
  importance?: "low" | "normal" | "high";
  /**
   * When true, create the draft and return its id WITHOUT sending.
   * Haldu pilot kill-switch — allows human review before send.
   */
  draftOnly?: boolean;
  /**
   * Whether to include the original message body in the reply.
   * Graph sets this automatically for createReply/createReplyAll; for `forward` it's always included.
   */
  includeOriginal?: boolean;
}>;

export type OutlookMessageReplyOutput = Readonly<{
  /** Draft id (when draftOnly) or sent draft id from createReply (when not draftOnly). */
  messageId: string;
  /** True when the message is a draft (draftOnly mode); false when it was sent. */
  isDraft: boolean;
}>;

export class OutlookMessageReply implements RunnableNodeConfig<OutlookMessageReplyOptions, OutlookMessageReplyOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = OutlookMessageReplyNode;
  readonly icon = "builtin:microsoft-outlook" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OutlookMessageReplyOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const mode = this.cfg.forward ? "Forward" : this.cfg.replyAll ? "Reply-all to" : "Reply to";
    const draftSuffix = this.cfg.draftOnly ? " (draft only)" : "";
    const msgId = this.cfg.messageId?.trim();
    const msgPart = msgId ? ` message \`${msgId}\`` : " message (id from upstream)";
    return `${mode}${msgPart}${draftSuffix}.`;
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
// Helpers
// ---------------------------------------------------------------------------

function toGraphRecipients(emails: ReadonlyArray<string>): ReadonlyArray<Recipient> {
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

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OutlookMessageReplyNode implements RunnableNode<OutlookMessageReply> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<OutlookMessageReply>): Promise<unknown> {
    const { ctx } = args;
    const { cfg } = ctx.config;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);
    const binary = ctx.binary;
    const prefix = mailboxPathPrefix(cfg.mailbox);
    const msgId = encodeURIComponent(cfg.messageId);

    // Validate forward requirements
    if (cfg.forward && (!cfg.to || cfg.to.length === 0)) {
      throw new Error("OutlookMessageReplyNode: forward: true requires at least one recipient in `to`.");
    }

    // Step 1: Create the draft via createReply / createReplyAll / createForward
    // (forward takes precedence over replyAll if both are somehow set)
    let createEndpoint: string;
    if (cfg.forward) {
      createEndpoint = `${prefix}/messages/${msgId}/createForward`;
    } else if (cfg.replyAll) {
      createEndpoint = `${prefix}/messages/${msgId}/createReplyAll`;
    } else {
      createEndpoint = `${prefix}/messages/${msgId}/createReply`;
    }

    const draft = (await withGraphRetry(() => client.api(createEndpoint).post(undefined))) as { id?: string };

    const draftId = draft?.id;
    if (!draftId) {
      throw new Error("OutlookMessageReplyNode: createReply/createReplyAll/createForward returned no draft id.");
    }

    // Step 2: PATCH the draft with body, recipients, and importance.
    // Note: Graph does NOT allow setting `attachments` via PATCH on an existing draft —
    // the field is silently ignored. Attachments are added via POST /attachments below.
    const patchBody: Record<string, unknown> = {
      body: {
        contentType: cfg.bodyType === "html" ? "html" : "text",
        content: cfg.body,
      },
    };

    // Build recipients — apply filterRecipients if provided
    const applyFilter = cfg.filterRecipients ?? ((rs: ReadonlyArray<Recipient>) => rs);

    if (cfg.to !== undefined) {
      patchBody["toRecipients"] = applyFilter(toGraphRecipients(cfg.to));
    }
    if (cfg.cc !== undefined) {
      patchBody["ccRecipients"] = applyFilter(toGraphRecipients(cfg.cc));
    }
    if (cfg.bcc !== undefined) {
      patchBody["bccRecipients"] = applyFilter(toGraphRecipients(cfg.bcc));
    }
    if (cfg.importance !== undefined) {
      patchBody["importance"] = cfg.importance;
    }

    await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}`).patch(patchBody));

    // Step 3: Add attachments via POST /attachments (one call per attachment).
    // Graph's PATCH endpoint on an existing draft silently ignores the `attachments` field,
    // so each attachment must be posted individually to /messages/{id}/attachments.
    const attachmentObjects = await collectAttachments(
      binary,
      args.item as Item,
      cfg.attachments,
      cfg.inlineAttachments,
    );
    for (const att of attachmentObjects) {
      await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}/attachments`).post(att));
    }

    // Step 4: Send or return draft id
    if (!cfg.draftOnly) {
      await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}/send`).post(undefined));
    }

    const output: OutlookMessageReplyOutput = {
      messageId: draftId,
      isDraft: cfg.draftOnly ?? false,
    };

    return { ...(args.item as Item), json: output };
  }
}
