import { describe, expect, it, vi } from "vitest";
import { OutlookMessageGetNode } from "../../src/mail/outlookMessageGetNode";
import { OutlookMessageGet } from "../../src/mail/outlookMessageGetNode";

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

function makeCtx(cfg: ConstructorParameters<typeof OutlookMessageGet>[1]) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  return {
    config: new OutlookMessageGet("get", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary: { attach: vi.fn(), withAttachment: vi.fn(), openReadStream: vi.fn() },
  };
}

describe("OutlookMessageGetNode", () => {
  it("happy path: fetches a message and maps it through mapGraphMessage", async () => {
    const node = new OutlookMessageGetNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", messageId: "msg-1" });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith("/me/messages/msg-1");
      expect(req.select).toHaveBeenCalled();
      expect(req.expand).not.toHaveBeenCalled(); // expandAttachments not set

      const out = result as { json: { messageId: string; subject?: string } };
      expect(out.json.messageId).toBe("msg-1");
      expect(out.json.subject).toBe("Hello");
    } finally {
      spy.mockRestore();
    }
  });

  it("expands attachments when expandAttachments: true", async () => {
    const node = new OutlookMessageGetNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "alice@contoso.com", messageId: "msg-2", expandAttachments: true });
      await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(req.expand).toHaveBeenCalledWith(expect.stringContaining("attachments"));
    } finally {
      spy.mockRestore();
    }
  });

  it("uses /users/{mailbox} prefix for non-me mailboxes", async () => {
    const node = new OutlookMessageGetNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "user@contoso.com", messageId: "msg-3" });
      await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/users/user%40contoso.com/messages/"));
    } finally {
      spy.mockRestore();
    }
  });

  it("propagates non-retryable errors immediately (404)", async () => {
    const node = new OutlookMessageGetNode();
    const req: GraphApiRequest = {
      select: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      get: vi.fn().mockRejectedValue(Object.assign(new Error("Not found"), { statusCode: 404 })),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", messageId: "msg-missing" });
      await expect(
        node.execute({ item: { json: {} }, ctx: ctx as never, input: {} as never, itemIndex: 0, items: [] as never }),
      ).rejects.toThrow("Not found");
      // Non-retryable: get called exactly once
      expect(req.get).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("OutlookMessageGet config declares correct credential requirements", () => {
    const cfg = new OutlookMessageGet("test", { mailbox: "me", messageId: "m1" });
    const creds = cfg.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
