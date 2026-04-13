import type { CredentialRequirement, ItemValueArgs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord, GmailOutgoingMessageAttachment } from "../services/GmailApiClient";
import { SendGmailMessageNode } from "./SendGmailMessageNode";

export type GmailConfigValue<T, TItemJson = unknown> =
  | T
  | Readonly<{ fn: (args: ItemValueArgs<TItemJson>) => T | Promise<T> }>;

export type SendGmailMessageOptions<TItemJson = unknown> = Readonly<{
  to: GmailConfigValue<string | ReadonlyArray<string>, TItemJson>;
  subject: GmailConfigValue<string, TItemJson>;
  text?: GmailConfigValue<string | undefined, TItemJson>;
  html?: GmailConfigValue<string | undefined, TItemJson>;
  cc?: GmailConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
  bcc?: GmailConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
  replyTo?: GmailConfigValue<string | undefined, TItemJson>;
  from?: GmailConfigValue<string | undefined, TItemJson>;
  headers?: GmailConfigValue<Readonly<Record<string, string>> | undefined, TItemJson>;
  attachments?: GmailConfigValue<ReadonlyArray<GmailOutgoingMessageAttachment> | undefined, TItemJson>;
}>;

export type SendGmailMessageOutputJson = GmailMessageRecord;

export class SendGmailMessage implements RunnableNodeConfig<unknown, SendGmailMessageOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SendGmailMessageNode;

  constructor(
    public readonly name: string,
    public readonly cfg: SendGmailMessageOptions,
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

export { SendGmailMessageNode } from "./SendGmailMessageNode";
