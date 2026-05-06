export type OnNewMsGraphMailOptions = Readonly<{
  /**
   * Mailbox to monitor. Use `"me"` (or leave empty) to monitor the credential owner's own mailbox.
   */
  mailbox: string;
  /** Folder to monitor. Defaults to "Inbox". */
  folderId?: string;
  /**
   * Graph OData `$filter` expression applied server-side when polling.
   * Defaults to `"isRead eq false"` when omitted.
   */
  filter?: string;
  /** When true, fetches attachment content for each new message and stores via ctx.binary. Default: false. */
  downloadAttachments?: boolean;
  /** Maximum size in bytes for an individual attachment binary fetch. Default: 25 MiB. */
  attachmentSizeCapBytes?: number;
  /** Polling interval in milliseconds. Default: 60_000. */
  pollIntervalMs?: number;
}>;

// Type aliases for MsGraphMailItem and MsGraphMailTriggerState re-exported from types
export type { MsGraphMailItem, MsGraphMailTriggerState } from "./types";
