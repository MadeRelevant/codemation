import type { CredentialRequirement, TriggerNodeConfig, TypeToken } from "@codemation/core";
import { MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphMailOAuth";
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
  /**
   * Graph OData `$filter` expression applied server-side when polling.
   * Defaults to `"isRead eq false"` when omitted. Pass an empty string `""` to disable
   * filtering entirely (retrieve all messages regardless of read status).
   */
  filter?: string;
  /** When true, fetches attachment content for each new message and stores via ctx.binary. Default: false. */
  downloadAttachments?: boolean;
  /**
   * Maximum size in bytes for an individual attachment binary fetch.
   * Attachments exceeding this cap are skipped (not fetched) and recorded in
   * `item.json.skippedAttachments`. Default: 25 * 1024 * 1024 (25 MiB).
   */
  attachmentSizeCapBytes?: number;
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
  readonly icon = "builtin:microsoft-outlook" as const;

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
    const mailboxLabel = !mailbox || mailbox.toLowerCase() === "me" ? "me" : mailbox;
    const folder = this.cfg.folderId?.trim() || "inbox";
    const intervalSec = Math.round((this.cfg.pollIntervalMs ?? 60_000) / 1000);
    const extras: string[] = [];
    if (this.cfg.filter) extras.push(`filter: ${this.cfg.filter}`);
    if (this.cfg.downloadAttachments) extras.push("fetch attachments");
    const suffix = extras.length ? `, ${extras.join(", ")}` : "";
    return `Watch mailbox \`${mailboxLabel}\` (folder \`${folder}\`) for new mail every ${intervalSec}s${suffix}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to monitor.",
      },
    ];
  }
}
