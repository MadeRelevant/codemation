import { defineNode } from "@codemation/core";
import type { Item, NodeBinaryAttachmentService } from "@codemation/core";
import { z } from "zod";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import type { MsGraphSession } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
  // Returns either a Web ReadableStream (Node 20+ Graph SDK 3.x) or a Node Readable.
  // ctx.binary.attach accepts both via the BinaryBody union, so we don't need a narrower type.
  getStream(): Promise<unknown>;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const DEFAULT_SIZE_CAP_BYTES = 25 * 1024 * 1024; // 25 MiB

export const OutlookAttachmentDownloadInputSchema = z.object({
  mailbox: z.string().default("me"),
  messageId: z.string().default(""),
  attachmentId: z.string().default(""),
  binarySlot: z.string().default("attachment"),
  sizeCapBytes: z.number().int().min(1).default(DEFAULT_SIZE_CAP_BYTES),
});

export type OutlookAttachmentDownloadInput = z.infer<typeof OutlookAttachmentDownloadInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type OutlookAttachmentDownloadOutput = {
  messageId: string;
  attachmentId: string;
  filename: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId: string | null;
  binarySlot: string;
};

// ---------------------------------------------------------------------------
// Raw Graph attachment response shape
// ---------------------------------------------------------------------------

type RawFileAttachment = {
  "@odata.type": string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string | null;
  contentBytes?: string;
};

// ---------------------------------------------------------------------------
// Core download function (exported for testing)
// ---------------------------------------------------------------------------

export async function downloadAttachment(args: {
  client: GraphClient;
  input: OutlookAttachmentDownloadInput;
  binary: NodeBinaryAttachmentService;
  item: Item;
}): Promise<Item<OutlookAttachmentDownloadOutput>> {
  const { client, input, binary, item } = args;
  const { mailbox, messageId, attachmentId, binarySlot, sizeCapBytes } = input;

  const prefix = mailboxPathPrefix(mailbox);
  const baseUrl = `${prefix}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;

  // Step 1: small metadata-only request — validate type + enforce size cap BEFORE
  // pulling any bytes. Keeps the round-trip cheap when the attachment is the
  // wrong type or oversized.
  const metaUrl = `${baseUrl}?$select=id,name,contentType,size,isInline,contentId`;
  const meta = (await withGraphRetry(() => client.api(metaUrl).get())) as RawFileAttachment;

  const odataType = meta["@odata.type"] ?? "";
  if (odataType !== "#microsoft.graph.fileAttachment") {
    throw new Error(
      `OutlookAttachmentDownload: attachment "${attachmentId}" is of type "${odataType}", ` +
        `but only "#microsoft.graph.fileAttachment" is supported. ` +
        `itemAttachment and referenceAttachment do not carry downloadable bytes.`,
    );
  }

  const size = meta.size ?? 0;
  if (size > sizeCapBytes) {
    throw new Error(
      `OutlookAttachmentDownload: attachment "${meta.name ?? attachmentId}" is ${size} bytes, ` +
        `which exceeds the size cap of ${sizeCapBytes} bytes. ` +
        `Increase sizeCapBytes or skip this attachment.`,
    );
  }

  const filename = meta.name ?? attachmentId;
  const contentType = meta.contentType ?? "application/octet-stream";

  // Step 2: stream the raw bytes from the /$value endpoint straight into
  // binary storage. Avoids the base64-in-JSON round-trip (which would
  // materialise the entire payload twice in memory: as a string, then as a
  // decoded Buffer).
  const valueStream = await withGraphRetry(() => client.api(`${baseUrl}/$value`).getStream());

  const stored = await binary.attach({
    name: binarySlot,
    body: valueStream as unknown as Parameters<typeof binary.attach>[0]["body"],
    mimeType: contentType,
    filename,
  });

  const output: OutlookAttachmentDownloadOutput = {
    messageId,
    attachmentId,
    filename,
    contentType,
    size,
    isInline: meta.isInline ?? false,
    contentId: meta.contentId ?? null,
    binarySlot,
  };

  const resultItem = binary.withAttachment({ ...item, json: output }, binarySlot, stored);
  return resultItem as Item<OutlookAttachmentDownloadOutput>;
}

// ---------------------------------------------------------------------------
// Options type (for workflow DSL consumers)
// ---------------------------------------------------------------------------

export type OutlookAttachmentDownloadOptions = Readonly<{
  mailbox?: string;
  messageId?: string;
  attachmentId?: string;
  binarySlot?: string;
  sizeCapBytes?: number;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const outlookAttachmentDownloadNode = defineNode({
  key: "msgraph-mail.outlook-attachment-download",
  title: "Download Outlook attachment",
  description:
    "Download a single Outlook mail attachment by id and store its bytes in a binary slot via ctx.binary. " +
    "Falls back to item.json.messageId / item.json.attachmentId when cfg ids are empty.",
  icon: "builtin:microsoft-outlook",
  keepBinaries: true,
  inspectorSummary({ config }) {
    const cfg = config as unknown as OutlookAttachmentDownloadOptions;
    const rows = [{ label: "Mailbox", value: String(cfg.mailbox || "me") }];
    if (cfg.binarySlot) {
      rows.push({ label: "Binary slot", value: cfg.binarySlot });
    }
    if (cfg.sizeCapBytes !== undefined) {
      rows.push({ label: "Size cap", value: `${Math.round(cfg.sizeCapBytes / (1024 * 1024))}MiB` });
    }
    return rows;
  },
  credentials: {
    auth: {
      type: msGraphMailOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential (Mail.Read scope is sufficient).",
    },
  },
  async execute({ item }, { config, credentials, execution }) {
    const session = (await credentials.auth()) as MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;
    const binary = execution.binary as NodeBinaryAttachmentService;

    // Item.json fallback so chains like OnNewMsGraphMailTrigger → Filter → OutlookAttachmentDownload
    // flow without UI expression wiring.
    const fromItem = (item.json ?? {}) as { messageId?: string; attachmentId?: string };
    const input = OutlookAttachmentDownloadInputSchema.parse({
      mailbox: config.mailbox || "me",
      messageId: config.messageId || fromItem.messageId || "",
      attachmentId: config.attachmentId || fromItem.attachmentId || "",
      binarySlot: config.binarySlot || "attachment",
      sizeCapBytes: config.sizeCapBytes,
    });

    const result = await downloadAttachment({
      client,
      input,
      binary,
      item: item as Item,
    });

    return result.json;
  },
});
