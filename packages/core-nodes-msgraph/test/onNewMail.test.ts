import { describe, expect, it } from "vitest";
import { PollingTriggerDedupWindow } from "@codemation/core";
import { runCycle } from "../src/mail/onNewMailNode";
import type { GraphClient, GraphApiRequest } from "../src/mail/onNewMailNode";
import type { MsGraphMailTriggerState } from "../src/mail/types";
import type { GraphMessageRaw } from "../src/mail/messageMapper";

// ---------------------------------------------------------------------------
// Fake Graph client — stubs the minimal request chain we actually call
// ---------------------------------------------------------------------------

function makeFakeClient(
  messages: GraphMessageRaw[],
  onUrl?: (url: string) => void,
  onFilter?: (filter: string) => void,
  onExpand?: (expand: string) => void,
): GraphClient {
  function makeReq(): GraphApiRequest {
    const req: GraphApiRequest = {
      top: (_n) => req,
      orderby: (_f) => req,
      select: (_s) => req,
      filter: (expr) => {
        onFilter?.(expr);
        return req;
      },
      expand: (rel) => {
        onExpand?.(rel);
        return req;
      },
      get: async () => ({ value: messages }),
    };
    return req;
  }

  return {
    api: (url: string) => {
      onUrl?.(url);
      return makeReq();
    },
  };
}

const dedup = new PollingTriggerDedupWindow();
const defaultCfg = { mailbox: "user@contoso.com" };

const msg = (id: string, receivedAt = "2024-01-15T10:00:00Z"): GraphMessageRaw => ({
  id,
  receivedDateTime: receivedAt,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCycle", () => {
  it("baseline poll: seeds dedup window, emits zero items", async () => {
    const client = makeFakeClient([msg("a"), msg("b")]);
    const result = await runCycle({
      client,
      cfg: defaultCfg,
      previousState: undefined,
      dedup,
    });

    expect(result.items).toHaveLength(0);
    expect(result.nextState.baselineComplete).toBe(true);
    expect(result.nextState.processedMessageIds).toContain("a");
    expect(result.nextState.processedMessageIds).toContain("b");
  });

  it("second poll with new messages emits them oldest-first", async () => {
    const previousState: MsGraphMailTriggerState = {
      mailbox: "user@contoso.com",
      folderId: "Inbox",
      processedMessageIds: ["old"],
      baselineComplete: true,
    };
    // API returns newest-first (as Graph does with orderby=receivedDateTime desc)
    const client = makeFakeClient([
      msg("newer", "2024-01-15T11:00:00Z"),
      msg("older", "2024-01-15T09:00:00Z"),
      msg("old", "2024-01-14T10:00:00Z"), // already seen
    ]);
    const result = await runCycle({
      client,
      cfg: defaultCfg,
      previousState,
      dedup,
    });

    // "old" is filtered out; "newer" and "older" remain and are reversed to oldest-first
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.json.messageId).toBe("older");
    expect(result.items[1]!.json.messageId).toBe("newer");
    expect(result.nextState.processedMessageIds).toContain("newer");
    expect(result.nextState.processedMessageIds).toContain("older");
    expect(result.nextState.processedMessageIds).toContain("old");
  });

  it("already-seen message IDs are dropped on second poll", async () => {
    const previousState: MsGraphMailTriggerState = {
      mailbox: "user@contoso.com",
      folderId: "Inbox",
      processedMessageIds: ["a", "b", "c"],
      baselineComplete: true,
    };
    const client = makeFakeClient([msg("a"), msg("b"), msg("c")]);
    const result = await runCycle({
      client,
      cfg: defaultCfg,
      previousState,
      dedup,
    });

    expect(result.items).toHaveLength(0);
  });

  it("forwards folderId into the API path", async () => {
    let capturedUrl = "";
    const client = makeFakeClient([], (url) => {
      capturedUrl = url;
    });
    await runCycle({
      client,
      cfg: { mailbox: "user@contoso.com", folderId: "SentItems" },
      previousState: undefined,
      dedup,
    });

    expect(capturedUrl).toContain("SentItems");
  });

  it("forwards $filter into the request when cfg.filter is set", async () => {
    let capturedFilter = "";
    const client = makeFakeClient([], undefined, (f) => {
      capturedFilter = f;
    });
    await runCycle({
      client,
      cfg: { mailbox: "user@contoso.com", filter: "isRead eq false" },
      previousState: undefined,
      dedup,
    });

    expect(capturedFilter).toBe("isRead eq false");
  });

  it("does NOT expand attachments when downloadAttachments is false/omitted", async () => {
    let capturedExpand: string | undefined;
    const client = makeFakeClient([], undefined, undefined, (e) => {
      capturedExpand = e;
    });
    await runCycle({
      client,
      cfg: { mailbox: "user@contoso.com", downloadAttachments: false },
      previousState: undefined,
      dedup,
    });

    expect(capturedExpand).toBeUndefined();
  });

  it("expands attachments when downloadAttachments is true", async () => {
    let capturedExpand = "";
    const client = makeFakeClient([], undefined, undefined, (e) => {
      capturedExpand = e;
    });
    await runCycle({
      client,
      cfg: { mailbox: "user@contoso.com", downloadAttachments: true },
      previousState: undefined,
      dedup,
    });

    expect(capturedExpand).toBeTruthy();
  });
});
