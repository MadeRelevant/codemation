import type { CredentialRequirement, NodeInspectorSummaryRow, TriggerNodeConfig, TypeToken } from "@codemation/core";
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
  /** Inline plain-text body (from MIME `text/plain` when present in the full message). */
  textPlain?: string;
  /** Inline HTML body (from MIME `text/html` when present). */
  textHtml?: string;
  from?: string;
  to?: string;
  subject?: string;
  deliveredTo?: string;
  attachments: ReadonlyArray<GmailMessageAttachmentRecord>;
}>;

export type OnNewGmailTriggerOptions = Readonly<{
  mailbox: string;
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
        acceptedTypes: [GmailCredentialTypes.oauth],
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

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [{ label: "Mailbox", value: this.cfg.mailbox }];
    if (this.cfg.labelIds && this.cfg.labelIds.length > 0) {
      rows.push({ label: "Labels", value: this.cfg.labelIds.join(", ").slice(0, 80) });
    }
    if (this.cfg.query) {
      const query = this.cfg.query.length > 80 ? `${this.cfg.query.slice(0, 79)}…` : this.cfg.query;
      rows.push({ label: "Query", value: query });
    }
    if (this.cfg.downloadAttachments) {
      rows.push({ label: "Download attachments", value: "yes" });
    }
    return rows;
  }
}
