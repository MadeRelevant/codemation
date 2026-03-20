import { injectable } from "@codemation/core";
import type { GmailApiClient,GmailLabelRecord } from "./GmailApiClient";

@injectable()
export class GmailConfiguredLabelService {
  private readonly labelsByMailbox = new Map<string, ReadonlyArray<GmailLabelRecord>>();

  async resolveLabelIds(args: Readonly<{
    client: GmailApiClient;
    mailbox: string;
    configuredLabels?: ReadonlyArray<string>;
  }>): Promise<ReadonlyArray<string> | undefined> {
    if (!args.configuredLabels || args.configuredLabels.length === 0) {
      return undefined;
    }
    const labels = await this.loadLabels(args.client, args.mailbox);
    const labelsById = new Set(labels.map((label) => label.id));
    const labelIdByName = new Map<string, string>();
    for (const label of labels) {
      labelIdByName.set(label.name.trim().toLowerCase(), label.id);
    }
    const resolvedLabelIds: string[] = [];
    const unresolvedLabels: string[] = [];
    for (const configuredLabel of args.configuredLabels) {
      const normalizedValue = configuredLabel.trim();
      if (!normalizedValue) {
        continue;
      }
      if (labelsById.has(normalizedValue)) {
        resolvedLabelIds.push(normalizedValue);
        continue;
      }
      const resolvedByName = labelIdByName.get(normalizedValue.toLowerCase());
      if (resolvedByName) {
        resolvedLabelIds.push(resolvedByName);
        continue;
      }
      unresolvedLabels.push(normalizedValue);
    }
    if (unresolvedLabels.length > 0) {
      throw new Error(
        `Unknown Gmail label(s) for mailbox ${args.mailbox}: ${unresolvedLabels.join(", ")}. Configure GMAIL_TRIGGER_LABEL_IDS with Gmail label ids or exact label names.`,
      );
    }
    return resolvedLabelIds;
  }

  private async loadLabels(client: GmailApiClient, mailbox: string): Promise<ReadonlyArray<GmailLabelRecord>> {
    const cachedLabels = this.labelsByMailbox.get(mailbox);
    if (cachedLabels) {
      return cachedLabels;
    }
    const labels = await client.listLabels({
      mailbox,
    });
    this.labelsByMailbox.set(mailbox, labels);
    return labels;
  }
}
