import { describe, expect, it, vi } from "vitest";
import { OutlookMessagePatch, OutlookMessagePatchNode } from "../../src/mail/outlookMessagePatchNode";

type GraphApiRequest = {
  patch(body: unknown): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
  get(): Promise<unknown>;
};

type GraphClient = { api(url: string): GraphApiRequest };

function makeRequest(overrides: Partial<GraphApiRequest> = {}): GraphApiRequest {
  return {
    patch: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue({ id: "moved-msg-id" }),
    get: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeCtx(cfg: ConstructorParameters<typeof OutlookMessagePatch>[1]) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  return {
    config: new OutlookMessagePatch("patch", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary: { attach: vi.fn(), withAttachment: vi.fn(), openReadStream: vi.fn() },
  };
}

describe("OutlookMessagePatchNode", () => {
  it("patches categories and isRead in a single PATCH call", async () => {
    const node = new OutlookMessagePatchNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-1",
        categories: ["ciq-finished"],
        isRead: true,
      });

      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // PATCH should have been called once with categories + isRead
      expect(req.patch).toHaveBeenCalledTimes(1);
      const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(patchArg["categories"]).toEqual(["ciq-finished"]);
      expect(patchArg["isRead"]).toBe(true);

      // No move
      expect(req.post).not.toHaveBeenCalled();

      const out = result as { json: { messageId: string; moved: boolean } };
      expect(out.json.messageId).toBe("msg-1");
      expect(out.json.moved).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("moves message LAST and returns the new id", async () => {
    const node = new OutlookMessagePatchNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-orig",
        move: { folderId: "inbox" },
      });

      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // No patch body (no categories/isRead)
      expect(req.patch).not.toHaveBeenCalled();

      // Move should have been called with destinationId
      expect(req.post).toHaveBeenCalledTimes(1);
      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(postArg["destinationId"]).toBe("inbox");

      const out = result as { json: { messageId: string; moved: boolean } };
      expect(out.json.messageId).toBe("moved-msg-id");
      expect(out.json.moved).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("patch-then-move: PATCH happens before POST /move", async () => {
    const node = new OutlookMessagePatchNode();
    const callOrder: string[] = [];
    const req: GraphApiRequest = {
      patch: vi.fn().mockImplementation(() => {
        callOrder.push("patch");
        return Promise.resolve(undefined);
      }),
      post: vi.fn().mockImplementation(() => {
        callOrder.push("post");
        return Promise.resolve({ id: "new-id" });
      }),
      get: vi.fn().mockResolvedValue({}),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-both",
        isRead: false,
        move: { folderId: "deleteditems" },
      });

      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(callOrder).toEqual(["patch", "post"]);

      const out = result as { json: { messageId: string; moved: boolean } };
      expect(out.json.messageId).toBe("new-id");
      expect(out.json.moved).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("move-only: skips PATCH, returns new id", async () => {
    const node = new OutlookMessagePatchNode();
    const req = makeRequest({ post: vi.fn().mockResolvedValue({ id: "moved-only" }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-x",
        move: { folderId: "drafts" },
      });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(req.patch).not.toHaveBeenCalled();
      const out = result as { json: { messageId: string; moved: boolean } };
      expect(out.json.messageId).toBe("moved-only");
      expect(out.json.moved).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("patch-only: no move, returns original id", async () => {
    const node = new OutlookMessagePatchNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "patch-only-id",
        categories: ["ciq-error"],
      });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(req.post).not.toHaveBeenCalled();
      const out = result as { json: { messageId: string; moved: boolean } };
      expect(out.json.messageId).toBe("patch-only-id");
      expect(out.json.moved).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("propagates non-retryable errors immediately when patching (404)", async () => {
    const node = new OutlookMessagePatchNode();
    const req: GraphApiRequest = {
      patch: vi.fn().mockRejectedValue(Object.assign(new Error("Message not found"), { statusCode: 404 })),
      post: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", messageId: "m", isRead: true });
      await expect(
        node.execute({ item: { json: {} }, ctx: ctx as never, input: {} as never, itemIndex: 0, items: [] as never }),
      ).rejects.toThrow("Message not found");
      // Non-retryable: patch called exactly once
      expect(req.patch).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
