export type GmailNodesOptions = Readonly<{
  /** How often to poll Gmail for new messages (milliseconds). */
  pollIntervalMs?: number;
  /** Max message ids to request per poll (`users.messages.list`). */
  maxMessagesPerPoll?: number;
}>;
