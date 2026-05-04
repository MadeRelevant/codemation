import type { NodeExecutionContext } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../contracts/GmailSession";
import type {
  ModifyGmailLabels,
  ModifyGmailLabelsInputJson,
  ModifyGmailLabelsOutputJson,
} from "../nodes/ModifyGmailLabels";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";

export type GmailModifyLabelsServiceArgs = Readonly<{
  input: ModifyGmailLabelsInputJson;
  ctx: NodeExecutionContext<ModifyGmailLabels>;
}>;

@injectable()
export class GmailModifyLabelsService {
  constructor(
    @inject(GoogleGmailApiClientFactory)
    private readonly googleGmailApiClientFactory: GoogleGmailApiClientFactory,
    @inject(GmailConfiguredLabelService)
    private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
  ) {}

  async modify(args: GmailModifyLabelsServiceArgs): Promise<ModifyGmailLabelsOutputJson> {
    const session = await args.ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    const mailbox = session.emailAddress ?? session.userId;
    const addLabelIds = await this.resolveLabelIds(client, mailbox, args.input.addLabelIds, args.input.addLabels);
    const removeLabelIds = await this.resolveLabelIds(
      client,
      mailbox,
      args.input.removeLabelIds,
      args.input.removeLabels,
    );
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      throw new Error("ModifyGmailLabels expected at least one label id or label name to add or remove.");
    }
    if ((args.input.target ?? "message") === "thread") {
      const threadId = this.resolveRequiredString(args.input.threadId, "threadId");
      await client.modifyThreadLabels({
        threadId,
        addLabelIds,
        removeLabelIds,
      });
      return {
        target: "thread",
        threadId,
        addLabelIds,
        removeLabelIds,
      };
    }
    return await client.modifyMessageLabels({
      messageId: this.resolveRequiredString(args.input.messageId, "messageId"),
      addLabelIds,
      removeLabelIds,
    });
  }

  private resolveRequiredString(value: string | undefined, fieldName: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`ModifyGmailLabels expected input.${fieldName} to be a non-empty string.`);
    }
    return value.trim();
  }

  private async resolveLabelIds(
    client: Parameters<GmailConfiguredLabelService["resolveLabelIds"]>[0]["client"],
    mailbox: string,
    idValue: string | ReadonlyArray<string> | undefined,
    labelValue: string | ReadonlyArray<string> | undefined,
  ): Promise<ReadonlyArray<string>> {
    const directIds = this.resolveStringList(idValue);
    const labelNames = this.resolveStringList(labelValue);
    if (labelNames.length === 0) {
      return directIds;
    }
    const resolvedIds =
      (await this.gmailConfiguredLabelService.resolveLabelIds({
        client,
        mailbox,
        configuredLabels: labelNames,
      })) ?? [];
    return [...directIds, ...resolvedIds];
  }

  private resolveStringList(value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> {
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    return [];
  }
}
