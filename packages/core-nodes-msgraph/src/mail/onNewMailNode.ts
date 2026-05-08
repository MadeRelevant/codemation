import { definePollingTrigger } from "@codemation/core";
import type { Item, Items, NodeBinaryAttachmentService } from "@codemation/core";
import { createGraphClient } from "../credentials/session";
import type { MsGraphSession } from "../credentials/session";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import type { GraphMessageRaw } from "./messageMapper";
import { mapGraphMessage } from "./messageMapper";
import type { OnNewMsGraphMailOptions } from "./onNewMailConfig";
import type { MsGraphMailItem, MsGraphMailSkippedAttachment, MsGraphMailTriggerState } from "./types";

const TOP_PER_POLL = 25;
const TOP_PER_TEST = 5;
const DEFAULT_FOLDER = "inbox";
// Metadata-only $expand: keeps payloads small and never returns base64 contentBytes.
// Bytes are fetched separately in execute() when downloadAttachments is true.
// isInline and contentId are included so inline attachments can be tagged correctly.
// contentId lives on the derived type microsoft.graph.fileAttachment — OData $select needs the type-cast prefix.
const ATTACHMENT_METADATA_EXPAND =
  "attachments($select=id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId)";
const DEFAULT_ATTACHMENT_SIZE_CAP_BYTES = 25 * 1024 * 1024;
const DEFAULT_FILTER = "isRead eq false";

// ---------------------------------------------------------------------------
// runCycle — pure function, fully unit-testable without DI
// ---------------------------------------------------------------------------

/**
 * Minimal Graph API request surface used by runCycle. Intentionally narrow so
 * tests can stub it without importing the full SDK.
 */
export type GraphApiRequest = {
  top(n: number): GraphApiRequest;
  orderby(field: string): GraphApiRequest;
  select(fields: string): GraphApiRequest;
  filter(expr: string): GraphApiRequest;
  expand(rel: string): GraphApiRequest;
  get(): Promise<unknown>;
  getStream(): Promise<unknown>;
};

/**
 * Minimal Graph client surface used by runCycle. The real `Client` satisfies
 * this, and a simple stub works in tests.
 */
export type GraphClient = {
  api(url: string): GraphApiRequest;
};

function buildMessagesRequest(args: {
  client: GraphClient;
  cfg: OnNewMsGraphMailOptions;
  top: number;
}): GraphApiRequest {
  const { client, cfg, top } = args;
  const folderId = cfg.folderId ?? DEFAULT_FOLDER;
  let request = client
    .api(`${mailboxPathPrefix(cfg.mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages`)
    .top(top)
    .select(
      "id,conversationId,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,bccRecipients,subject,body,internetMessageHeaders,hasAttachments",
    )
    .expand(ATTACHMENT_METADATA_EXPAND);
  const effectiveFilter = cfg.filter !== undefined ? cfg.filter : DEFAULT_FILTER;
  if (effectiveFilter) {
    request = request.filter(effectiveFilter);
  } else {
    request = request.orderby("receivedDateTime desc");
  }
  return request;
}

export async function runCycle(args: {
  client: GraphClient;
  cfg: OnNewMsGraphMailOptions;
  previousState: MsGraphMailTriggerState | undefined;
  dedup: { merge(prev: ReadonlyArray<string>, incoming: ReadonlyArray<string>): ReadonlyArray<string> };
}): Promise<{ items: Items<MsGraphMailItem>; nextState: MsGraphMailTriggerState }> {
  const { client, cfg, previousState, dedup } = args;
  const folderId = cfg.folderId ?? DEFAULT_FOLDER;

  const state: MsGraphMailTriggerState = previousState ?? {
    mailbox: cfg.mailbox,
    folderId,
    processedMessageIds: [],
    baselineComplete: false,
  };

  const request = buildMessagesRequest({ client, cfg, top: TOP_PER_POLL });
  const response = (await withGraphRetry(() => request.get())) as { value?: ReadonlyArray<GraphMessageRaw> };
  const messages = response.value ?? [];
  const messageIds = messages.map((m) => m.id);

  if (!state.baselineComplete) {
    const nextState: MsGraphMailTriggerState = {
      ...state,
      processedMessageIds: dedup.merge(state.processedMessageIds, messageIds),
      baselineComplete: true,
    };
    return { items: [], nextState };
  }

  const processedSet = new Set(state.processedMessageIds);
  const newMessages = [...messages].reverse().filter((m) => !processedSet.has(m.id));

  const items: Item<MsGraphMailItem>[] = newMessages.map((raw) => ({
    json: mapGraphMessage(raw),
  }));

  const nextState: MsGraphMailTriggerState = {
    ...state,
    processedMessageIds: dedup.merge(state.processedMessageIds, messageIds),
    baselineComplete: true,
  };

  return { items: items as Items<MsGraphMailItem>, nextState };
}

// ---------------------------------------------------------------------------
// Attachment helpers
// ---------------------------------------------------------------------------

function sanitizeContentId(contentId: string): string {
  const stripped = contentId.trim().replace(/^<|>$/g, "");
  return stripped.replace(/[^A-Za-z0-9._@-]/g, "_");
}

export async function attachAttachmentBinaries(
  item: Item<MsGraphMailItem>,
  client: GraphClient,
  cfg: OnNewMsGraphMailOptions,
  binary: NodeBinaryAttachmentService,
): Promise<Item<MsGraphMailItem>> {
  const attachments = item.json.attachments;
  if (!attachments || attachments.length === 0) {
    return item;
  }
  const sizeCap = cfg.attachmentSizeCapBytes ?? DEFAULT_ATTACHMENT_SIZE_CAP_BYTES;
  let result = item;
  const seen = new Map<string, number>();
  const skipped: MsGraphMailSkippedAttachment[] = [];

  for (const att of attachments) {
    if (att.size > sizeCap) {
      skipped.push({ name: att.name, size: att.size, reason: "size-cap" });
      continue;
    }

    // Two-phase: metadata already in `att` from the $expand on the message poll.
    // Fetch raw bytes via /$value (streaming) — avoids base64-in-JSON round-trip
    // that would materialise the entire payload twice in memory.
    const valueUrl = `${mailboxPathPrefix(cfg.mailbox)}/messages/${encodeURIComponent(item.json.messageId)}/attachments/${encodeURIComponent(att.id)}/$value`;
    const valueStream = await withGraphRetry(() => client.api(valueUrl).getStream());

    if (!valueStream) {
      continue;
    }

    let slotBase: string;
    if (att.isInline && att.contentId) {
      slotBase = `inline:${sanitizeContentId(att.contentId)}`;
    } else {
      slotBase = att.name || `attachment-${att.id}`;
    }
    const slot = uniqueSlotName(seen, slotBase);

    const stored = await binary.attach({
      name: slot,
      body: valueStream as unknown as Parameters<typeof binary.attach>[0]["body"],
      mimeType: att.contentType,
      filename: att.name,
    });
    result = binary.withAttachment(result, slot, stored);
  }

  if (skipped.length > 0) {
    result = {
      ...result,
      json: { ...result.json, skippedAttachments: skipped },
    };
  }

  return result;
}

function uniqueSlotName(seen: Map<string, number>, base: string): string {
  const sanitized = base.trim() || "attachment";
  const count = (seen.get(sanitized) ?? 0) + 1;
  seen.set(sanitized, count);
  return count === 1 ? sanitized : `${sanitized}-${count}`;
}

// ---------------------------------------------------------------------------
// definePollingTrigger — declarative trigger definition
// ---------------------------------------------------------------------------

export const onNewMsGraphMailTrigger = definePollingTrigger({
  key: "msgraph-mail.on-new-mail",
  title: "On new mail",
  description: "Poll an Outlook mailbox folder and emit new messages on each cycle.",
  icon: "builtin:microsoft-outlook",
  inspectorSummary({ config }) {
    const cfg = config as unknown as OnNewMsGraphMailOptions;
    const rows = [
      { label: "Mailbox", value: String(cfg.mailbox ?? "me") },
      { label: "Folder", value: cfg.folderId ?? DEFAULT_FOLDER },
    ];
    if (cfg.filter !== undefined && cfg.filter !== DEFAULT_FILTER) {
      const filter = cfg.filter.length > 80 ? `${cfg.filter.slice(0, 79)}…` : cfg.filter;
      rows.push({ label: "Filter", value: filter });
    }
    if (cfg.pollIntervalMs !== undefined) {
      rows.push({ label: "Poll interval", value: `${cfg.pollIntervalMs / 1000}s` });
    }
    if (cfg.downloadAttachments) {
      rows.push({ label: "Download attachments", value: "yes" });
    }
    return rows;
  },
  credentials: {
    auth: {
      type: msGraphMailOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to monitor.",
    },
  },
  async poll({ config: rawConfig, state, credentials }) {
    const session = (await credentials.auth()) as unknown as MsGraphSession;
    const client = createGraphClient(session) as unknown as GraphClient;
    // Cast config to the known options type
    const config = rawConfig as unknown as OnNewMsGraphMailOptions;

    // Cast state to our known shape (or create initial state if none)
    const prevState = state as MsGraphMailTriggerState | undefined | null;
    const folderId = config.folderId ?? DEFAULT_FOLDER;
    const prevProcessedIds: ReadonlyArray<string> =
      prevState && Array.isArray((prevState as MsGraphMailTriggerState).processedMessageIds)
        ? (prevState as MsGraphMailTriggerState).processedMessageIds
        : [];
    const baselineComplete: boolean =
      prevState != null && typeof (prevState as MsGraphMailTriggerState).baselineComplete === "boolean"
        ? (prevState as MsGraphMailTriggerState).baselineComplete
        : false;

    const request = buildMessagesRequest({ client, cfg: config, top: TOP_PER_POLL });
    const response = (await withGraphRetry(() => request.get())) as { value?: ReadonlyArray<GraphMessageRaw> };
    const messages = response.value ?? [];
    const messageIds = messages.map((m) => m.id);
    const mergedIds = [...new Set([...prevProcessedIds, ...messageIds])];

    if (!baselineComplete) {
      const nextState = {
        mailbox: String(config.mailbox),
        folderId,
        processedMessageIds: mergedIds,
        baselineComplete: true,
      };
      return { items: [], nextState };
    }

    const processedSet = new Set(prevProcessedIds);
    const newMessages = [...messages].reverse().filter((m) => !processedSet.has(m.id));

    const nextState = {
      mailbox: String(config.mailbox),
      folderId,
      processedMessageIds: mergedIds,
      baselineComplete: true,
    };

    return {
      items: newMessages.map((raw) => ({
        json: mapGraphMessage(raw),
        dedupKey: raw.id,
      })),
      nextState,
    };
  },

  async execute(items, ctx) {
    const config = ctx.config.cfg as OnNewMsGraphMailOptions;
    if (!config.downloadAttachments || items.length === 0) {
      return { main: items };
    }
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;
    const binary = ctx.binary as NodeBinaryAttachmentService;
    const enriched = await Promise.all(
      (items as Items<MsGraphMailItem>).map((item) => attachAttachmentBinaries(item, client, config, binary)),
    );
    return { main: enriched };
  },

  async testItems(ctx) {
    const config = ctx.config.cfg as OnNewMsGraphMailOptions;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session) as unknown as GraphClient;
    const request = buildMessagesRequest({ client, cfg: config, top: TOP_PER_TEST });
    const response = (await withGraphRetry(() => request.get())) as { value?: ReadonlyArray<GraphMessageRaw> };
    const messages = response.value ?? [];
    return messages.map((raw) => ({ json: mapGraphMessage(raw) })) as Items<MsGraphMailItem>;
  },
});
