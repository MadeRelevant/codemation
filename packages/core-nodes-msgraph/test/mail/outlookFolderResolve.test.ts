import { describe, expect, it, vi } from "vitest";
import { resolveFolderPath } from "../../src/mail/outlookFolderResolveNode";
import type { OutlookFolderResolveOptions } from "../../src/mail/outlookFolderResolveNode";

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

describe("resolveFolderPath (outlookFolderResolveNode helper)", () => {
  it("returns well-known folder id directly without an API call (first segment)", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "Inbox" };
    const result = await resolveFolderPath(client as never, cfg);

    expect(client.api).not.toHaveBeenCalled();
    expect(result.folderId).toBe("inbox");
    expect(result.path).toBe("Inbox");
  });

  it("resolves single custom segment via displayName filter", async () => {
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [{ id: "folder-abc", displayName: "BoeschDev" }] }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "BoeschDev" };
    const result = await resolveFolderPath(client as never, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/me/mailFolders"));
    expect(req.filter).toHaveBeenCalledWith("displayName eq 'BoeschDev'");
    expect(result.folderId).toBe("folder-abc");
  });

  it("resolves nested 2-segment path: well-known root then child by displayName", async () => {
    let apiCallCount = 0;
    const req = makeRequest({
      get: vi.fn().mockImplementation(() => {
        apiCallCount++;
        if (apiCallCount === 1) {
          return Promise.resolve({ value: [{ id: "receipts-id", displayName: "Receipts" }] });
        }
        return Promise.resolve({ value: [] });
      }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "Inbox/Receipts" };
    const result = await resolveFolderPath(client as never, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/mailFolders/inbox/childFolders"));
    expect(req.filter).toHaveBeenCalledWith("displayName eq 'Receipts'");
    expect(result.folderId).toBe("receipts-id");
    expect(result.path).toBe("Inbox/Receipts");
  });

  it("resolves nested 3-segment path: Inbox/Projects/2026", async () => {
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

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "Inbox/Projects/2026" };
    const result = await resolveFolderPath(client as never, cfg);

    expect(client.api).toHaveBeenCalledTimes(2);
    expect(result.folderId).toBe("2026-id");
    expect(result.path).toBe("Inbox/Projects/2026");
  });

  it("throws on missing segment when createIfMissing is false", async () => {
    const req = makeRequest({ get: vi.fn().mockResolvedValue({ value: [] }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "NonExistent", createIfMissing: false };
    await expect(resolveFolderPath(client as never, cfg)).rejects.toThrow(/NonExistent/);
  });

  it("creates missing segment when createIfMissing is true", async () => {
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn().mockResolvedValue({ id: "new-folder-id" }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "NewFolder", createIfMissing: true };
    const result = await resolveFolderPath(client as never, cfg);

    expect(req.post).toHaveBeenCalledTimes(1);
    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(postArg["displayName"]).toBe("NewFolder");
    expect(result.folderId).toBe("new-folder-id");
  });

  it("creates missing child segment when createIfMissing is true (nested path)", async () => {
    const req = makeRequest({
      get: vi.fn().mockResolvedValue({ value: [] }),
      post: vi.fn().mockResolvedValue({ id: "new-child-id" }),
    });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "Inbox/NewSub", createIfMissing: true };
    const result = await resolveFolderPath(client as never, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/mailFolders/inbox/childFolders"));
    expect(req.post).toHaveBeenCalledTimes(1);
    expect(result.folderId).toBe("new-child-id");
  });

  it("handles displayName with single quotes (OData escape)", async () => {
    const req = makeRequest({ get: vi.fn().mockResolvedValue({ value: [{ id: "id-apostrophe" }] }) });
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "O'Reilly" };
    await resolveFolderPath(client as never, cfg);

    expect(req.filter).toHaveBeenCalledWith("displayName eq 'O''Reilly'");
  });

  it("throws when folderPath is empty", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: "" };
    await expect(resolveFolderPath(client as never, cfg)).rejects.toThrow(/folderPath is empty/);
  });

  it("resolves all well-known folder names case-insensitively", async () => {
    const req = makeRequest();
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const wellKnown = ["SentItems", "DeletedItems", "Drafts", "Archive", "JunkEmail", "Outbox"];
    for (const name of wellKnown) {
      const cfg: OutlookFolderResolveOptions = { mailbox: "me", folderPath: name };
      const result = await resolveFolderPath(client as never, cfg);
      expect(result.folderId).toBe(name.toLowerCase());
    }
    expect(client.api).not.toHaveBeenCalled();
  });
});
