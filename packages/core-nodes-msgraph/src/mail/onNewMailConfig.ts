import type { CredentialRequirement, TriggerNodeConfig, TypeToken } from "@codemation/core";
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphOAuth";
import { OnNewMsGraphMailTriggerNode } from "./onNewMailNode";
import type { MsGraphMailItem, MsGraphMailTriggerState } from "./types";

export type OnNewMsGraphMailOptions = Readonly<{
  /**
   * Mailbox to monitor. Use `"me"` (or leave empty) to monitor the credential owner's own mailbox
   * via `/me/mailFolders/...` (works with the default `Mail.Read` scope). Use a full email/UPN to
   * monitor someone else's mailbox via `/users/{mailbox}/...` — that requires `Mail.Read.Shared`
   * (delegated, must be granted by the target mailbox owner) or `Mail.Read` application permission.
   */
  mailbox: string;
  /** Folder to monitor. Defaults to "Inbox". */
  folderId?: string;
  /** Graph $filter expression (e.g. `"isRead eq false"`). Optional. */
  filter?: string;
  /** When true, fetches attachment content (base64) for each new message. Default: false. */
  downloadAttachments?: boolean;
  /** Polling interval in milliseconds. Default: 60_000. */
  pollIntervalMs?: number;
}>;

/**
 * Trigger configuration for the "On new mail" Microsoft Graph trigger.
 * Drop this into a workflow builder's `.trigger(...)` call.
 */
export class OnNewMsGraphMailTrigger implements TriggerNodeConfig<
  MsGraphMailItem,
  MsGraphMailTriggerState | undefined
> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = OnNewMsGraphMailTriggerNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OnNewMsGraphMailOptions,
    public readonly id?: string,
  ) {}

  /**
   * Human-readable summary of what this trigger does, surfaced in the workflow UI's
   * properties panel so authors revisiting the workflow see the live configuration at a glance.
   */
  get description(): string {
    const mailbox = this.cfg.mailbox?.trim();
    const mailboxLabel = !mailbox || mailbox.toLowerCase() === "me" ? "the connected user" : mailbox;
    const folder = (this.cfg.folderId ?? "inbox").trim();
    const intervalSec = Math.round((this.cfg.pollIntervalMs ?? 60_000) / 1000);
    const lines = [`Polls Microsoft Graph for new mail in **${folder}** of **${mailboxLabel}** every ${intervalSec}s.`];
    if (this.cfg.filter) {
      lines.push(`Server-side filter: \`${this.cfg.filter}\``);
    }
    if (this.cfg.downloadAttachments) {
      lines.push("Includes attachment payloads (base64) on each message.");
    }
    lines.push(
      "First poll baseline-skips the existing mailbox (no flood); only mails arriving after setup are emitted. Use the Test button to preview live messages without waiting.",
    );
    return lines.join("\n\n");
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to monitor.",
      },
    ];
  }
}
