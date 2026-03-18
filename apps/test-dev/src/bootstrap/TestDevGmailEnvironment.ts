import type { GmailServiceAccountCredential } from "@codemation/core-nodes-gmail";

type TestDevGmailEnvironmentVariable =
  | "GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL"
  | "GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY"
  | "GMAIL_SERVICE_ACCOUNT_PROJECT_ID"
  | "GMAIL_SERVICE_ACCOUNT_DELEGATED_USER"
  | "GMAIL_TRIGGER_MAILBOX"
  | "GMAIL_TRIGGER_TOPIC_NAME"
  | "GMAIL_TRIGGER_SUBSCRIPTION_NAME"
  | "GMAIL_TRIGGER_LABEL_IDS"
  | "GMAIL_TRIGGER_QUERY";

export class TestDevGmailEnvironment {
  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}

  resolveCredential(): GmailServiceAccountCredential {
    const delegatedUser = this.resolveDelegatedUser();
    if (!delegatedUser) {
      throw new Error("Gmail demo workflow requires GMAIL_SERVICE_ACCOUNT_DELEGATED_USER or GMAIL_TRIGGER_MAILBOX.");
    }
    return {
      clientEmail: this.resolveRequiredVariable("GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL"),
      privateKey: this.normalizePrivateKey(this.resolveRequiredVariable("GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY")),
      projectId: this.resolveRequiredVariable("GMAIL_SERVICE_ACCOUNT_PROJECT_ID"),
      delegatedUser,
    };
  }

  resolveTriggerConfiguration(): Readonly<{
    mailbox: string;
    topicName: string;
    subscriptionName: string;
    labelIds?: ReadonlyArray<string>;
    query?: string;
  }> {
    return {
      mailbox: this.resolveVariable("GMAIL_TRIGGER_MAILBOX"),
      topicName: this.resolveVariable("GMAIL_TRIGGER_TOPIC_NAME"),
      subscriptionName: this.resolveVariable("GMAIL_TRIGGER_SUBSCRIPTION_NAME"),
      labelIds: this.resolveLabelIds(),
      query: this.resolveOptionalVariable("GMAIL_TRIGGER_QUERY"),
    };
  }

  private resolveDelegatedUser(): string | undefined {
    return (
      this.resolveOptionalVariable("GMAIL_SERVICE_ACCOUNT_DELEGATED_USER") ??
      this.resolveOptionalVariable("GMAIL_TRIGGER_MAILBOX")
    );
  }

  private resolveLabelIds(): ReadonlyArray<string> | undefined {
    const rawValue = this.resolveOptionalVariable("GMAIL_TRIGGER_LABEL_IDS");
    if (!rawValue) {
      return undefined;
    }
    const labelIds = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return labelIds.length > 0 ? labelIds : undefined;
  }

  private resolveRequiredVariable(variable: TestDevGmailEnvironmentVariable): string {
    const value = this.resolveOptionalVariable(variable);
    if (!value) {
      throw new Error(`Gmail demo workflow requires ${variable}.`);
    }
    return value;
  }

  private resolveVariable(variable: TestDevGmailEnvironmentVariable): string {
    return this.resolveOptionalVariable(variable) ?? "";
  }

  private resolveOptionalVariable(variable: TestDevGmailEnvironmentVariable): string | undefined {
    const value = this.env[variable];
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    return value;
  }

  private normalizePrivateKey(privateKey: string): string {
    return privateKey.replace(/\\n/g, "\n");
  }
}
