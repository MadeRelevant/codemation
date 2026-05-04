import type { CredentialRequirement, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { z } from "zod";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord } from "../services/GmailApiClient";
import { gmailOutgoingAttachmentInputSchema } from "./SendGmailMessage";
import { ReplyToGmailMessageNode } from "./ReplyToGmailMessageNode";

export const replyToGmailMessageInputSchema = z.object({
  messageId: z.string().trim().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(gmailOutgoingAttachmentInputSchema).readonly().optional(),
  replyToSenderOnly: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  subject: z.string().optional(),
});

export type ReplyToGmailMessageInputJson = z.infer<typeof replyToGmailMessageInputSchema>;

export type ReplyToGmailMessageOutputJson = GmailMessageRecord;

export class ReplyToGmailMessage implements RunnableNodeConfig<
  ReplyToGmailMessageInputJson,
  ReplyToGmailMessageOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ReplyToGmailMessageNode;
  readonly inputSchema = replyToGmailMessageInputSchema;

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

export { ReplyToGmailMessageNode } from "./ReplyToGmailMessageNode";
