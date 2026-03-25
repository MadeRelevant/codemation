import type { CredentialRequirement, TriggerNodeConfig, TypeToken } from "@codemation/core";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { GmailMessageAttachmentRecord } from "../services/GmailApiClient";
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
  /** When omitted, resolved from env (`GMAIL_TRIGGER_*`, `GOOGLE_CLOUD_PROJECT`) or the Gmail credential project id. */
  topicName?: string | undefined;
  /** When omitted, resolved together with {@link topicName}. */
  subscriptionName?: string | undefined;
  labelIds?: ReadonlyArray<string>;
  query?: string;
  downloadAttachments?: boolean;
}>;

export class OnNewGmailTrigger implements TriggerNodeConfig<
  OnNewGmailTriggerItemJson,
  GmailTriggerSetupState | undefined
> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = OnNewGmailTriggerNode;
  readonly icon = "si:gmail" as const;

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

  hasRequiredConfiguration(): boolean {
    return this.resolveMissingConfigurationFields().length === 0;
  }

  resolveMissingConfigurationFields(): ReadonlyArray<string> {
    const missingFields: string[] = [];
    if (this.cfg.mailbox.trim().length === 0) {
      missingFields.push("mailbox");
    }
    return missingFields;
  }
}
