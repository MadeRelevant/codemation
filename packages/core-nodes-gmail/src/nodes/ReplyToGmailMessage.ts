import type { CredentialRequirement, ItemExprArgs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord, GmailOutgoingMessageAttachment } from "../services/GmailApiClient";
import { ReplyToGmailMessageNode } from "./ReplyToGmailMessageNode";

export type GmailReplyConfigValue<T, TItemJson = unknown> =
  | T
  | Readonly<{ fn: (args: ItemExprArgs<TItemJson>) => T | Promise<T> }>;

export type ReplyToGmailMessageOptions<TItemJson = unknown> = Readonly<{
  messageId: GmailReplyConfigValue<string, TItemJson>;
  text?: GmailReplyConfigValue<string | undefined, TItemJson>;
  html?: GmailReplyConfigValue<string | undefined, TItemJson>;
  attachments?: GmailReplyConfigValue<ReadonlyArray<GmailOutgoingMessageAttachment> | undefined, TItemJson>;
  replyToSenderOnly?: GmailReplyConfigValue<boolean | undefined, TItemJson>;
  headers?: GmailReplyConfigValue<Readonly<Record<string, string>> | undefined, TItemJson>;
  subject?: GmailReplyConfigValue<string | undefined, TItemJson>;
}>;

export type ReplyToGmailMessageOutputJson = GmailMessageRecord;

export class ReplyToGmailMessage implements RunnableNodeConfig<unknown, ReplyToGmailMessageOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ReplyToGmailMessageNode;

  constructor(
    public readonly name: string,
    public readonly cfg: ReplyToGmailMessageOptions,
    public readonly id?: string,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Gmail account",
        acceptedTypes: [GmailCredentialTypes.oauth],
        helpText: "Bind a Gmail OAuth credential that resolves to an authenticated Gmail session.",
      },
    ];
  }
}

export { ReplyToGmailMessageNode } from "./ReplyToGmailMessageNode";
