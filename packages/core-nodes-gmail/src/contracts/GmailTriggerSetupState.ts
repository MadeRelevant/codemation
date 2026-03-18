export type GmailTriggerSetupState = Readonly<{
  mailbox: string;
  topicName: string;
  subscriptionName: string;
  historyId: string;
  watchExpiration: string;
  lastNotificationAt?: string;
  lastSynchronizedAt?: string;
}>;
