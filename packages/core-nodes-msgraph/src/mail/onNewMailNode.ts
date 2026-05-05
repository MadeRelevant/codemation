import type {
  Item,
  Items,
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

  // Build Graph API request
  let request = client
    .api(`${mailboxPathPrefix(cfg.mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages`)
    .top(TOP_PER_POLL)
    .orderby("receivedDateTime desc")
    .select(
      "id,conversationId,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,bccRecipients,subject,body,attachments,internetMessageHeaders",
    );

  if (cfg.filter) {
    request = request.filter(cfg.filter);
  }
  if (cfg.downloadAttachments) {
    request = request.expand("attachments");
  }

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
    return fetchRecentMessages({ client, cfg, top: TOP_PER_TEST });
  }

  async execute(items: Items<MsGraphMailItem>, _ctx: unknown): Promise<NodeOutputs> {
    return { main: items };
  }
}

async function fetchRecentMessages(args: {
  client: GraphClient;
  cfg: OnNewMsGraphMailOptions;
  top: number;
}): Promise<Items<MsGraphMailItem>> {
  const { client, cfg, top } = args;
  const folderId = cfg.folderId ?? DEFAULT_FOLDER;
  let request = client
    .api(`${mailboxPathPrefix(cfg.mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages`)
    .top(top)
    .orderby("receivedDateTime desc")
    .select(
      "id,conversationId,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,bccRecipients,subject,body,attachments,internetMessageHeaders",
    );
  if (cfg.filter) {
    request = request.filter(cfg.filter);
  }
  if (cfg.downloadAttachments) {
    request = request.expand("attachments");
  }
  const response = (await request.get()) as { value?: ReadonlyArray<GraphMessageRaw> };
  const messages = response.value ?? [];
  return messages.map((raw) => ({ json: mapGraphMessage(raw) })) as Items<MsGraphMailItem>;
}
