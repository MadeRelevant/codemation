type GmailTriggerEnvVariable =
  | "GMAIL_TRIGGER_MAILBOX"
  | "GMAIL_TRIGGER_TOPIC_NAME"
  | "GMAIL_TRIGGER_SUBSCRIPTION_NAME"
  | "GMAIL_TRIGGER_LABEL_IDS"
  | "GMAIL_TRIGGER_QUERY";

export class GmailTriggerEnvReader {
  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}

  readTriggerConfiguration(): Readonly<{
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

  private resolveVariable(variable: GmailTriggerEnvVariable): string {
    return this.resolveOptionalVariable(variable) ?? "";
  }

  private resolveOptionalVariable(variable: GmailTriggerEnvVariable): string | undefined {
    const value = this.env[variable];
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    return value;
  }
}
