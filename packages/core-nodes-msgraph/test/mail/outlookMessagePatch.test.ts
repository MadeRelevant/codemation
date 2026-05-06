import { describe, expect, it, vi } from "vitest";
import { patchMessage } from "../../src/mail/outlookMessagePatchNode";
import type { OutlookMessagePatchOptions } from "../../src/mail/outlookMessagePatchNode";

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

describe("patchMessage (outlookMessagePatchNode helper)", () => {
  it("patches categories and isRead in a single PATCH call", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessagePatchOptions = {
      mailbox: "me",
      messageId: "msg-1",
      categories: ["ciq-finished"],
      isRead: true,
    };

    const result = await patchMessage(client as never, cfg);

    expect(req.patch).toHaveBeenCalledTimes(1);
    const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(patchArg["categories"]).toEqual(["ciq-finished"]);
    expect(patchArg["isRead"]).toBe(true);
    expect(req.post).not.toHaveBeenCalled();
    expect(result.messageId).toBe("msg-1");
    expect(result.moved).toBe(false);
  });

  it("moves message LAST and returns the new id", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessagePatchOptions = { mailbox: "me", messageId: "msg-orig", move: { folderId: "inbox" } };
    const result = await patchMessage(client as never, cfg);

    expect(req.patch).not.toHaveBeenCalled();
    expect(req.post).toHaveBeenCalledTimes(1);
    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(postArg["destinationId"]).toBe("inbox");
    expect(result.messageId).toBe("moved-msg-id");
    expect(result.moved).toBe(true);
  });

  it("patch-then-move: PATCH happens before POST /move", async () => {
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

    const cfg: OutlookMessagePatchOptions = {
      mailbox: "me",
      messageId: "msg-both",
      isRead: false,
      move: { folderId: "deleteditems" },
    };
    const result = await patchMessage(client as never, cfg);

    expect(callOrder).toEqual(["patch", "post"]);
    expect(result.messageId).toBe("new-id");
    expect(result.moved).toBe(true);
  });

  it("move-only: skips PATCH, returns new id", async () => {
    const req = makeRequest({ post: vi.fn().mockResolvedValue({ id: "moved-only" }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessagePatchOptions = { mailbox: "me", messageId: "msg-x", move: { folderId: "drafts" } };
    const result = await patchMessage(client as never, cfg);

    expect(req.patch).not.toHaveBeenCalled();
    expect(result.messageId).toBe("moved-only");
    expect(result.moved).toBe(true);
  });

  it("patch-only: no move, returns original id", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessagePatchOptions = { mailbox: "me", messageId: "patch-only-id", categories: ["ciq-error"] };
    const result = await patchMessage(client as never, cfg);

    expect(req.post).not.toHaveBeenCalled();
    expect(result.messageId).toBe("patch-only-id");
    expect(result.moved).toBe(false);
  });

  it("propagates non-retryable errors immediately when patching (404)", async () => {
    const req: GraphApiRequest = {
      patch: vi.fn().mockRejectedValue(Object.assign(new Error("Message not found"), { statusCode: 404 })),
      post: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookMessagePatchOptions = { mailbox: "me", messageId: "m", isRead: true };
    await expect(patchMessage(client as never, cfg)).rejects.toThrow("Message not found");
    expect(req.patch).toHaveBeenCalledTimes(1);
  });
});
