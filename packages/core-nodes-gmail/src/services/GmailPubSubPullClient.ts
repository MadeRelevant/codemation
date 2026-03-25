import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";

export type GmailPubSubNotification = Readonly<{
  emailAddress: string;
  historyId: string;
  messageId?: string;
  publishTime?: string;
}>;

export interface GmailPulledNotification {
  readonly notification: GmailPubSubNotification;
  ack(): Promise<void>;
}

export interface GmailPubSubPullClient {
  ensureSubscription(
    args: Readonly<{
      credential: GmailServiceAccountCredential;
      topicName: string;
      subscriptionName: string;
    }>,
  ): Promise<void>;
  pull(
    args: Readonly<{
      credential: GmailServiceAccountCredential;
      subscriptionName: string;
      maxMessages?: number;
    }>,
  ): Promise<ReadonlyArray<GmailPulledNotification>>;
}
