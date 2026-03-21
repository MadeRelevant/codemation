import type { GmailPubSubNotification } from "../../services/GmailPubSubPullClient";

export class GmailPubSubJsonNotificationReader {
  static parse(data: string | Uint8Array | Buffer | undefined): GmailPubSubNotification | undefined {
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
}
