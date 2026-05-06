import { describe, expect, it, vi } from "vitest";
import { fetchMessage, outlookMessageGetNode } from "../../src/mail/outlookMessageGetNode";
import type { OutlookMessageGetOptions } from "../../src/mail/outlookMessageGetNode";

// Narrow stub matching the Graph client interface used by the node
type GraphApiRequest = {
  select(fields: string): GraphApiRequest;
  expand(rel: string): GraphApiRequest;
  filter(expr: string): GraphApiRequest;
  get(): Promise<unknown>;
};

type GraphClient = { api(url: string): GraphApiRequest };

function makeRequest(overrides: Partial<GraphApiRequest> = {}): GraphApiRequest {
  const req: GraphApiRequest = {
    select: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      id: "msg-1",
      subject: "Hello",
      body: { contentType: "text", content: "World" },
      toRecipients: [],
      receivedDateTime: "2026-05-01T00:00:00Z",
      internetMessageId: "<hello@example.com>",
    }),
    ...overrides,
  };
  return req;
}

describe("fetchMessage (outlookMessageGetNode helper)", () => {
  it("happy path: fetches a message and maps it through mapGraphMessage", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessageGetOptions = { mailbox: "me", messageId: "msg-1" };
    const result = await fetchMessage(client as never, cfg);

    expect(client.api).toHaveBeenCalledWith("/me/messages/msg-1");
    expect(req.select).toHaveBeenCalled();
    expect(req.expand).not.toHaveBeenCalled(); // expandAttachments not set

    expect(result.messageId).toBe("msg-1");
    expect(result.subject).toBe("Hello");
  });

  it("expands attachments when expandAttachments: true", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessageGetOptions = { mailbox: "alice@contoso.com", messageId: "msg-2", expandAttachments: true };
    await fetchMessage(client as never, cfg);

    expect(req.expand).toHaveBeenCalledWith(expect.stringContaining("attachments"));
  });

  it("uses /users/{mailbox} prefix for non-me mailboxes", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessageGetOptions = { mailbox: "user@contoso.com", messageId: "msg-3" };
    await fetchMessage(client as never, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/users/user%40contoso.com/messages/"));
  });

  it("propagates non-retryable errors immediately (404)", async () => {
    const req: GraphApiRequest = {
      select: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      get: vi.fn().mockRejectedValue(Object.assign(new Error("Not found"), { statusCode: 404 })),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessageGetOptions = { mailbox: "me", messageId: "msg-missing" };
    await expect(fetchMessage(client as never, cfg)).rejects.toThrow("Not found");
    // Non-retryable: get called exactly once
    expect(req.get).toHaveBeenCalledTimes(1);
  });

  it("outlookMessageGetNode.create() declares correct credential requirements", () => {
    const cfgNode = outlookMessageGetNode.create({ mailbox: "me", messageId: "m1" } as never);
    const creds = cfgNode.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
