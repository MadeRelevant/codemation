import type {
  Item,
  Items,
  NodeBinaryAttachmentService,
  NodeExecutionContext,
  NodeOutputs,
  TestableTriggerNode,
  TriggerSetupContext,
  TriggerTestItemsContext,
} from "@codemation/core";
import { node } from "@codemation/core";
import { createGraphClient } from "../credentials/session";
import type { MsGraphSession } from "../credentials/session";
import type { GraphMessageRaw } from "./messageMapper";
import { mapGraphMessage } from "./messageMapper";
import type { OnNewMsGraphMailTrigger, OnNewMsGraphMailOptions } from "./onNewMailConfig";
import type { MsGraphMailItem, MsGraphMailTriggerState } from "./types";

const TOP_PER_POLL = 25;
const TOP_PER_TEST = 5;
// MS Graph well-known folder names are lowercase (`inbox`, `drafts`, `sentitems`, ...).
const DEFAULT_FOLDER = "inbox";
const DEFAULT_INTERVAL_MS = 60_000;
// Metadata-only $expand: keeps payloads small and never returns base64 contentBytes.
// Bytes are fetched separately in execute() when downloadAttachments is true.
const ATTACHMENT_METADATA_EXPAND = "attachments($select=id,name,contentType,size)";

/**
 * Build the Graph API path prefix for the configured mailbox. `/me/...` for the credential owner's
 * own mailbox (works with default `Mail.Read` scope) or `/users/{upn}/...` for shared mailboxes.
 * Empty / "me" / "self" all map to the credential-owner shortcut.
 */
function mailboxPathPrefix(mailbox: string): string {
  const trimmed = mailbox.trim().toLowerCase();
  if (trimmed === "" || trimmed === "me" || trimmed === "self") {
    return "/me";
  }
  return `/users/${encodeURIComponent(mailbox.trim())}`;
}

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
    // Always pull attachment metadata (id/name/contentType/size). Cheap; lets workflows decide
    // whether to download bytes in execute() without re-querying.
    .expand(ATTACHMENT_METADATA_EXPAND);
  if (cfg.filter) {
    // When $filter is set, omit $orderby. Graph's "restriction or sort order is too complex"
    // (HTTP 400) fires when the filter and orderby properties are not co-indexed; the default
    // /messages order is already receivedDateTime desc, so dropping orderby is lossless.
    request = request.filter(cfg.filter);
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
  const response = (await request.get()) as { value?: ReadonlyArray<GraphMessageRaw> };
  const messages = response.value ?? [];
  const messageIds = messages.map((m) => m.id);

  if (!state.baselineComplete) {
    // First poll: seed the dedup window, emit nothing.
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
// Trigger node class — registered with the engine
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OnNewMsGraphMailTriggerNode implements TestableTriggerNode<OnNewMsGraphMailTrigger> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(
    ctx: TriggerSetupContext<OnNewMsGraphMailTrigger, MsGraphMailTriggerState | undefined>,
  ): Promise<MsGraphMailTriggerState | undefined> {
    const cfg = ctx.config.cfg;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);

    return ctx.polling.start<MsGraphMailTriggerState, MsGraphMailItem>({
      intervalMs: cfg.pollIntervalMs ?? DEFAULT_INTERVAL_MS,
      seedState: ctx.previousState ?? undefined,
      runCycle: ({ previousState }) => runCycle({ client, cfg, previousState, dedup: ctx.polling.dedup }),
    });
  }

  // The "Test" button in the workflow UI calls this — returns the most recent
  // mails in the configured folder without consulting/mutating polling state,
  // so users can see real data without waiting for a new mail to arrive.
  async getTestItems(
    ctx: TriggerTestItemsContext<OnNewMsGraphMailTrigger, MsGraphMailTriggerState | undefined>,
  ): Promise<Items> {
    const cfg = ctx.config.cfg;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);
    const request = buildMessagesRequest({ client, cfg, top: TOP_PER_TEST });
    const response = (await request.get()) as { value?: ReadonlyArray<GraphMessageRaw> };
    const messages = response.value ?? [];
    return messages.map((raw) => ({ json: mapGraphMessage(raw) })) as Items<MsGraphMailItem>;
  }

  async execute(
    items: Items<MsGraphMailItem>,
    ctx: NodeExecutionContext<OnNewMsGraphMailTrigger>,
  ): Promise<NodeOutputs> {
    if (!ctx.config.cfg.downloadAttachments || items.length === 0) {
      return { main: items };
    }
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);
    const enriched = await Promise.all(items.map((item) => attachAttachmentBinaries(item, client, ctx)));
    return { main: enriched };
  }
}

/**
 * For each attachment on the message, fetch the bytes from Graph and register them via the
 * framework's binary storage (`ctx.binary.attach`). The bytes never live on the workflow item's
 * JSON payload — only a `BinaryAttachment` reference under `item.binary[<sanitized-name>]`,
 * so persisted run state stays small even with multi-megabyte attachments.
 */
async function attachAttachmentBinaries(
  item: Item<MsGraphMailItem>,
  client: GraphClient,
  ctx: NodeExecutionContext<OnNewMsGraphMailTrigger>,
): Promise<Item<MsGraphMailItem>> {
  const attachments = item.json.attachments;
  if (!attachments || attachments.length === 0) {
    return item;
  }
  const cfg = ctx.config.cfg;
  const binary = ctx.binary as NodeBinaryAttachmentService;
  let result = item;
  const seen = new Map<string, number>();
  for (const att of attachments) {
    // Fetch the full attachment representation: this includes contentBytes (base64) for
    // FileAttachment kinds. Item attachments / reference attachments don't return bytes —
    // we skip those gracefully.
    const raw = (await client
      .api(
        `${mailboxPathPrefix(cfg.mailbox)}/messages/${encodeURIComponent(item.json.messageId)}/attachments/${encodeURIComponent(att.id)}`,
      )
      .get()) as { contentBytes?: string };
    if (typeof raw.contentBytes !== "string" || raw.contentBytes.length === 0) {
      continue;
    }
    const slot = uniqueSlotName(seen, att.name || `attachment-${att.id}`);
    const stored = await binary.attach({
      name: slot,
      body: Buffer.from(raw.contentBytes, "base64"),
      mimeType: att.contentType,
      filename: att.name,
    });
    result = binary.withAttachment(result, slot, stored);
  }
  return result;
}

/**
 * Two attachments with the same filename within one message would otherwise overwrite each other
 * in `item.binary[name]`. Disambiguate with a -2/-3/... suffix.
 */
function uniqueSlotName(seen: Map<string, number>, base: string): string {
  const sanitized = base.trim() || "attachment";
  const count = (seen.get(sanitized) ?? 0) + 1;
  seen.set(sanitized, count);
  return count === 1 ? sanitized : `${sanitized}-${count}`;
}
