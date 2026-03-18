import type { CredentialInput, TriggerNodeConfig, TypeToken } from "@codemation/core";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import { OnNewGmailTriggerNode } from "./OnNewGmailTriggerNode";

export type OnNewGmailTriggerItemJson = Readonly<{
  mailbox: string;
  historyId: string;
  messageId: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds: ReadonlyArray<string>;
  headers: Readonly<Record<string, string>>;
  from?: string;
  to?: string;
  subject?: string;
  deliveredTo?: string;
}>;

export type OnNewGmailTriggerOptions = Readonly<{
  mailbox: string;
  credential: CredentialInput<GmailServiceAccountCredential>;
  topicName: string;
  subscriptionName: string;
  labelIds?: ReadonlyArray<string>;
  query?: string;
}>;

export class OnNewGmailTrigger
  implements TriggerNodeConfig<OnNewGmailTriggerItemJson, GmailTriggerSetupState | undefined>
{
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = OnNewGmailTriggerNode;

  constructor(
    public readonly name: string,
    public readonly cfg: OnNewGmailTriggerOptions,
    public readonly id?: string,
  ) {}
}
