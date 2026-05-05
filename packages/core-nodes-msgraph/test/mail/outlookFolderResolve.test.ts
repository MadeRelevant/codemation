import { describe, expect, it, vi } from "vitest";
import { OutlookFolderResolve, OutlookFolderResolveNode } from "../../src/mail/outlookFolderResolveNode";

// Narrow stub
type GraphApiRequest = {
  filter(expr: string): GraphApiRequest;
  select(fields: string): GraphApiRequest;
  top(n: number): GraphApiRequest;
  get(): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
};

type GraphClient = { api(url: string): GraphApiRequest };

function makeRequest(overrides: Partial<GraphApiRequest> = {}): GraphApiRequest {
  const req: GraphApiRequest = {
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ value: [] }),
    post: vi.fn().mockResolvedValue({ id: "created-id" }),
    ...overrides,
  };
  return req;
}

function makeCtx(cfg: ConstructorParameters<typeof OutlookFolderResolve>[1]) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  return {
    config: new OutlookFolderResolve("resolve", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary: {},
  };
}

describe("OutlookFolderResolveNode", () => {
  it("returns well-known folder id directly without an API call (first segment)", async () => {
    const node = new OutlookFolderResolveNode();
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "Inbox" });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // No API calls needed for well-known names
      expect(client.api).not.toHaveBeenCalled();

      const out = result as { json: { folderId: string; path: string } };
      expect(out.json.folderId).toBe("inbox");
      expect(out.json.path).toBe("Inbox");
    } finally {
      spy.mockRestore();
    }
  });

  it("resolves single custom segment via displayName filter", async () => {
    const node = new OutlookFolderResolveNode();
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [{ id: "folder-abc", displayName: "BoeschDev" }] }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "BoeschDev" });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/me/mailFolders"));
      expect(req.filter).toHaveBeenCalledWith("displayName eq 'BoeschDev'");

      const out = result as { json: { folderId: string } };
      expect(out.json.folderId).toBe("folder-abc");
    } finally {
      spy.mockRestore();
    }
  });

  it("resolves nested 2-segment path: well-known root then child by displayName", async () => {
    const node = new OutlookFolderResolveNode();

    let apiCallCount = 0;
    const req = makeRequest({
      get: vi.fn().mockImplementation(() => {
        apiCallCount++;
        if (apiCallCount === 1) {
          // child folder lookup
          return Promise.resolve({ value: [{ id: "receipts-id", displayName: "Receipts" }] });
        }
        return Promise.resolve({ value: [] });
      }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "Inbox/Receipts" });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // First segment (inbox) is well-known — no api call for it.
      // Second segment → childFolders under inbox
      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/mailFolders/inbox/childFolders"));
      expect(req.filter).toHaveBeenCalledWith("displayName eq 'Receipts'");

      const out = result as { json: { folderId: string; path: string } };
      expect(out.json.folderId).toBe("receipts-id");
      expect(out.json.path).toBe("Inbox/Receipts");
    } finally {
      spy.mockRestore();
    }
  });

  it("resolves nested 3-segment path: Inbox/Projects/2026", async () => {
    const node = new OutlookFolderResolveNode();

    // inbox → (well-known, no call)
    // Projects → childFolders/inbox → found "projects-id"
    // 2026 → childFolders/projects-id → found "2026-id"
    const apiResponses = [
      { value: [{ id: "projects-id", displayName: "Projects" }] },
      { value: [{ id: "2026-id", displayName: "2026" }] },
    ];
    let callCount = 0;
    const req = makeRequest({
      get: vi.fn().mockImplementation(() => {
        const resp = apiResponses[callCount++];
        return Promise.resolve(resp ?? { value: [] });
      }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "Inbox/Projects/2026" });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // 2 API calls: Projects under inbox, then 2026 under projects-id
      expect(client.api).toHaveBeenCalledTimes(2);

      const out = result as { json: { folderId: string; path: string } };
      expect(out.json.folderId).toBe("2026-id");
      expect(out.json.path).toBe("Inbox/Projects/2026");
    } finally {
      spy.mockRestore();
    }
  });

  it("throws on missing segment when createIfMissing is false", async () => {
    const node = new OutlookFolderResolveNode();
    const req = makeRequest({ get: vi.fn().mockResolvedValue({ value: [] }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "NonExistent", createIfMissing: false });
      await expect(
        node.execute({ item: { json: {} }, ctx: ctx as never, input: {} as never, itemIndex: 0, items: [] as never }),
      ).rejects.toThrow(/NonExistent/);
    } finally {
      spy.mockRestore();
    }
  });

  it("creates missing segment when createIfMissing is true", async () => {
    const node = new OutlookFolderResolveNode();
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [] }), // not found
      post: vi.fn().mockResolvedValue({ id: "new-folder-id" }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "NewFolder", createIfMissing: true });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(req.post).toHaveBeenCalledTimes(1);
      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(postArg["displayName"]).toBe("NewFolder");

      const out = result as { json: { folderId: string } };
      expect(out.json.folderId).toBe("new-folder-id");
    } finally {
      spy.mockRestore();
    }
  });

  it("creates missing child segment when createIfMissing is true (nested path)", async () => {
    const node = new OutlookFolderResolveNode();

    // Inbox is well-known; "NewSub" is missing under inbox
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [] }), // not found
      post: vi.fn().mockResolvedValue({ id: "new-child-id" }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "Inbox/NewSub", createIfMissing: true });
      const result = await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // POST to childFolders under inbox
      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/mailFolders/inbox/childFolders"));
      expect(req.post).toHaveBeenCalledTimes(1);

      const out = result as { json: { folderId: string } };
      expect(out.json.folderId).toBe("new-child-id");
    } finally {
      spy.mockRestore();
    }
  });

  it("handles displayName with single quotes (OData escape)", async () => {
    const node = new OutlookFolderResolveNode();
    const req = makeRequest({ get: vi.fn().mockResolvedValue({ value: [{ id: "id-apostrophe" }] }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "O'Reilly" });
      await node.execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // single quote should be escaped as ''
      expect(req.filter).toHaveBeenCalledWith("displayName eq 'O''Reilly'");
    } finally {
      spy.mockRestore();
    }
  });

  it("throws when folderPath is empty", async () => {
    const node = new OutlookFolderResolveNode();
    const client: GraphClient = { api: vi.fn().mockReturnValue(makeRequest()) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({ mailbox: "me", folderPath: "" });
      await expect(
        node.execute({ item: { json: {} }, ctx: ctx as never, input: {} as never, itemIndex: 0, items: [] as never }),
      ).rejects.toThrow(/folderPath is empty/);
    } finally {
      spy.mockRestore();
    }
  });

  it("resolves all well-known folder names case-insensitively", async () => {
    const node = new OutlookFolderResolveNode();
    const client: GraphClient = { api: vi.fn().mockReturnValue(makeRequest()) };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const wellKnown = ["SentItems", "DeletedItems", "Drafts", "Archive", "JunkEmail", "Outbox"];
      for (const name of wellKnown) {
        const ctx = makeCtx({ mailbox: "me", folderPath: name });
        const result = await node.execute({
          item: { json: {} },
          ctx: ctx as never,
          input: {} as never,
          itemIndex: 0,
          items: [] as never,
        });
        const out = result as { json: { folderId: string } };
        expect(out.json.folderId).toBe(name.toLowerCase());
      }
      // No API calls for any well-known name
      expect(client.api).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
