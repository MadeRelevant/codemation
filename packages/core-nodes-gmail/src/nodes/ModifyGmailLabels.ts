import type { CredentialRequirement, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { z } from "zod";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord } from "../services/GmailApiClient";
import { ModifyGmailLabelsNode } from "./ModifyGmailLabelsNode";

export type ModifyGmailLabelsTarget = "message" | "thread";

const gmailLabelListSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).nonempty().readonly(),
]);

export const modifyGmailLabelsInputSchema = z.object({
  target: z.enum(["message", "thread"]).optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  addLabelIds: gmailLabelListSchema.optional(),
  removeLabelIds: gmailLabelListSchema.optional(),
  addLabels: gmailLabelListSchema.optional(),
  removeLabels: gmailLabelListSchema.optional(),
});

export type ModifyGmailLabelsInputJson = z.infer<typeof modifyGmailLabelsInputSchema>;

export type GmailThreadLabelMutationResult = Readonly<{
  target: "thread";
  threadId: string;
  addLabelIds: ReadonlyArray<string>;
  removeLabelIds: ReadonlyArray<string>;
}>;

export type ModifyGmailLabelsOutputJson = GmailMessageRecord | GmailThreadLabelMutationResult;

export class ModifyGmailLabels implements RunnableNodeConfig<ModifyGmailLabelsInputJson, ModifyGmailLabelsOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ModifyGmailLabelsNode;
  readonly inputSchema = modifyGmailLabelsInputSchema;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Gmail account",
        acceptedTypes: [GmailCredentialTypes.oauth],
        helpText: "Bind a Gmail OAuth credential that resolves to an authenticated Gmail session.",
      },
    ];
  }
}

export { ModifyGmailLabelsNode } from "./ModifyGmailLabelsNode";
