import type { GmailMessageAttachmentRecord } from "../services/GmailApiClient";
import type { CredentialRequirement, TriggerNodeConfig, TypeToken } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
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
  attachments: ReadonlyArray<GmailMessageAttachmentRecord>;
}>;

export type OnNewGmailTriggerOptions = Readonly<{
  mailbox: string;
  topicName: string;
  subscriptionName: string;
  labelIds?: ReadonlyArray<string>;
  query?: string;
  downloadAttachments?: boolean;
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

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Gmail account",
        acceptedTypes: [GmailCredentialTypes.serviceAccount, GmailCredentialTypes.oauth],
        helpText: "Bind a Gmail credential that resolves to an authenticated Gmail trigger client.",
      },
    ];
  }
}
