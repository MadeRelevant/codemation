export type GmailTriggerSetupState = Readonly<{
  mailbox: string;
  /** IDs already seen so we only emit new mail (capped list for memory). */
  processedMessageIds: ReadonlyArray<string>;
  /** After the first poll, existing inbox snapshot is marked seen without emitting. */
  baselineComplete: boolean;
}>;
