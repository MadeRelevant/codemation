import { injectable } from "@codemation/core";
import { PubSub,v1 } from "@google-cloud/pubsub";
import type { GmailServiceAccountCredential } from "../../contracts/GmailServiceAccountCredential";
import type { GmailPubSubNotification,GmailPubSubPullClient,GmailPulledNotification } from "../../services/GmailPubSubPullClient";

@injectable()
export class GooglePubSubPullClient implements GmailPubSubPullClient {
  async ensureSubscription(args: Readonly<{
    credential: GmailServiceAccountCredential;
    topicName: string;
    subscriptionName: string;
  }>): Promise<void> {
    const client = this.createAdminClient(args.credential);
    const topic = client.topic(this.normalizeTopicName(args.topicName));
    const subscriptionName = this.normalizeSubscriptionName(args.subscriptionName);
    const subscription = topic.subscription(subscriptionName);
    const [exists] = await subscription.exists();
    if (!exists) {
      await topic.createSubscription(subscriptionName);
    }
  }

  async pull(args: Readonly<{
    credential: GmailServiceAccountCredential;
    subscriptionName: string;
    maxMessages?: number;
  }>): Promise<ReadonlyArray<GmailPulledNotification>> {
    const subscriberClient = this.createSubscriberClient(args.credential);
    const subscriptionPath = subscriberClient.subscriptionPath(args.credential.projectId, this.normalizeSubscriptionName(args.subscriptionName));
    const [response] = await subscriberClient.pull({
      subscription: subscriptionPath,
      maxMessages: args.maxMessages ?? 10,
      returnImmediately: true,
    });
    return (response.receivedMessages ?? []).flatMap((receivedMessage) => {
      const messageData = receivedMessage.message?.data ?? undefined;
      const parsedNotification = this.parseNotification(messageData);
      if (!parsedNotification || !receivedMessage.ackId) {
        return [];
      }
      return [
        {
          notification: parsedNotification,
          ack: async () => {
            await subscriberClient.acknowledge({
              subscription: subscriptionPath,
              ackIds: [receivedMessage.ackId!],
            });
          },
        },
      ];
    });
  }

  private parseNotification(data: string | Uint8Array | Buffer | undefined): GmailPubSubNotification | undefined {
    if (!data) {
      return undefined;
    }
    const decodedPayload = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    const parsed = JSON.parse(decodedPayload) as Readonly<{
      emailAddress?: string;
      historyId?: string;
      messageId?: string;
      publishTime?: string;
    }>;
    if (!parsed.emailAddress || !parsed.historyId) {
      return undefined;
    }
    return {
      emailAddress: parsed.emailAddress,
      historyId: parsed.historyId,
      messageId: parsed.messageId,
      publishTime: parsed.publishTime,
    };
  }

  private createAdminClient(credential: GmailServiceAccountCredential): PubSub {
    return new PubSub({
      projectId: credential.projectId,
      credentials: {
        client_email: credential.clientEmail,
        private_key: credential.privateKey,
      },
    });
  }

  private createSubscriberClient(credential: GmailServiceAccountCredential): v1.SubscriberClient {
    return new v1.SubscriberClient({
      projectId: credential.projectId,
      credentials: {
        client_email: credential.clientEmail,
        private_key: credential.privateKey,
      },
    });
  }

  private normalizeTopicName(topicName: string): string {
    const match = topicName.match(/projects\/[^/]+\/topics\/([^/]+)$/);
    return match?.[1] ?? topicName;
  }

  private normalizeSubscriptionName(subscriptionName: string): string {
    const match = subscriptionName.match(/projects\/[^/]+\/subscriptions\/([^/]+)$/);
    return match?.[1] ?? subscriptionName;
  }
}
