import { injectable } from "@codemation/core";

export type GmailTriggerPubSubResourceInput = Readonly<{
  topicName?: string | undefined;
  subscriptionName?: string | undefined;
}>;

@injectable()
export class GmailTriggerPubSubResourceResolver {
  private static readonly defaultTopicSegment = "codemation-gmail" as const;
  private static readonly defaultSubscriptionSegment = "codemation-gmail" as const;

  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}

  resolve(
    cfg: GmailTriggerPubSubResourceInput,
    projectIdHint: string | undefined,
  ): Readonly<{ topicName: string; subscriptionName: string }> | undefined {
    const topicFromCfg = this.trimOrUndefined(cfg.topicName);
    const subFromCfg = this.trimOrUndefined(cfg.subscriptionName);
    const topicFromEnv = this.readEnv("GMAIL_TRIGGER_TOPIC_NAME");
    const subFromEnv = this.readEnv("GMAIL_TRIGGER_SUBSCRIPTION_NAME");
    let topicName = topicFromCfg ?? topicFromEnv;
    let subscriptionName = subFromCfg ?? subFromEnv;
    if (topicName && subscriptionName) {
      return { topicName, subscriptionName };
    }
    const envProjectId = this.resolveEnvProjectId();
    const projectId =
      projectIdHint ??
      envProjectId ??
      this.extractProjectIdFromFqn(topicName) ??
      this.extractProjectIdFromFqn(subscriptionName);
    if (!projectId) {
      return undefined;
    }
    if (!topicName && !subscriptionName) {
      return {
        topicName: this.toFullyQualifiedTopic(projectId, GmailTriggerPubSubResourceResolver.defaultTopicSegment),
        subscriptionName: this.toFullyQualifiedSubscription(
          projectId,
          GmailTriggerPubSubResourceResolver.defaultSubscriptionSegment,
        ),
      };
    }
    if (topicName && !subscriptionName) {
      subscriptionName = this.inferMissingSubscriptionName(topicName);
    } else if (!topicName && subscriptionName) {
      topicName = this.inferMissingTopicName(subscriptionName);
    }
    if (!topicName || !subscriptionName) {
      return undefined;
    }
    return { topicName, subscriptionName };
  }

  private inferMissingSubscriptionName(topicName: string): string {
    const fromTopic = this.extractProjectIdFromFqn(topicName);
    if (fromTopic) {
      return this.toFullyQualifiedSubscription(
        fromTopic,
        GmailTriggerPubSubResourceResolver.defaultSubscriptionSegment,
      );
    }
    return GmailTriggerPubSubResourceResolver.defaultSubscriptionSegment;
  }

  private inferMissingTopicName(subscriptionName: string): string {
    const fromSub = this.extractProjectIdFromFqn(subscriptionName);
    if (fromSub) {
      return this.toFullyQualifiedTopic(fromSub, GmailTriggerPubSubResourceResolver.defaultTopicSegment);
    }
    return GmailTriggerPubSubResourceResolver.defaultTopicSegment;
  }

  private resolveEnvProjectId(): string | undefined {
    const keys = ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT", "GCLOUD_PROJECT"] as const;
    for (const key of keys) {
      const value = this.readEnv(key);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Prefer the injected env snapshot, then fall back to `process.env` so Pub/Sub resolution still works when the
   * host passes a partial copy of the environment.
   */
  private readEnv(key: string): string | undefined {
    const fromInjected = this.trimOrUndefined(this.env[key]);
    if (fromInjected) {
      return fromInjected;
    }
    return this.trimOrUndefined(this.resolveProcessEnv(key));
  }

  private resolveProcessEnv(key: string): string | undefined {
    if (typeof process === "undefined" || process.env === undefined) {
      return undefined;
    }
    const value = process.env[key];
    return typeof value === "string" ? value : undefined;
  }

  private trimOrUndefined(value: string | undefined): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private extractProjectIdFromFqn(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const match = value.match(/^projects\/([^/]+)\/(topics|subscriptions)\//);
    return match?.[1];
  }

  private toFullyQualifiedTopic(projectId: string, segment: string): string {
    return `projects/${projectId}/topics/${segment}`;
  }

  private toFullyQualifiedSubscription(projectId: string, segment: string): string {
    return `projects/${projectId}/subscriptions/${segment}`;
  }
}
