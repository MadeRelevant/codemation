import type { CredentialRequirement, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { z } from "zod";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord } from "../services/GmailApiClient";
import { SendGmailMessageNode } from "./SendGmailMessageNode";

export const gmailOutgoingAttachmentInputSchema = z.object({
  binaryName: z.string().trim().min(1),
  filename: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  contentTransferEncoding: z.enum(["base64", "quoted-printable", "7bit", "8bit", "binary"]).optional(),
  disposition: z.enum(["attachment", "inline"]).optional(),
});

const gmailRecipientsSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).nonempty().readonly(),
]);

export const sendGmailMessageInputSchema = z.object({
  to: gmailRecipientsSchema,
  subject: z.string().trim().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  cc: gmailRecipientsSchema.optional(),
  bcc: gmailRecipientsSchema.optional(),
  replyTo: z.string().optional(),
  from: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z.array(gmailOutgoingAttachmentInputSchema).readonly().optional(),
});

export type GmailOutgoingAttachmentInputJson = z.infer<typeof gmailOutgoingAttachmentInputSchema>;
export type SendGmailMessageInputJson = z.infer<typeof sendGmailMessageInputSchema>;

export type SendGmailMessageOutputJson = GmailMessageRecord;

export class SendGmailMessage implements RunnableNodeConfig<SendGmailMessageInputJson, SendGmailMessageOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SendGmailMessageNode;
  readonly inputSchema = sendGmailMessageInputSchema;

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

export { SendGmailMessageNode } from "./SendGmailMessageNode";
