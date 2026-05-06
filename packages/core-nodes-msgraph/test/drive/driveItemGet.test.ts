import { describe, expect, it, vi } from "vitest";
import { driveItemGetNode, type GraphClient, getItem } from "../../src/drive/driveItemGetNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawItem(
  overrides: Partial<{
    id: string;
    name: string;
    webUrl: string;
    size: number;
    mimeType: string;
    driveId: string;
    isFolder: boolean;
    permissions: unknown;
    listItem: unknown;
    thumbnails: unknown;
  }> = {},
) {
  const {
    id = "item-1",
    name = "file.xlsx",
    webUrl = "https://example.com/file.xlsx",
    size = 2048,
    mimeType = "application/vnd.ms-excel",
    driveId = "drive-abc",
    isFolder = false,
    permissions,
    listItem,
    thumbnails,
  } = overrides;
  return {
    id,
    name,
    webUrl,
    size,
    lastModifiedDateTime: "2026-02-01T00:00:00Z",
    file: isFolder ? undefined : { mimeType },
    folder: isFolder ? {} : undefined,
    parentReference: { driveId },
    permissions,
    listItem,
    thumbnails,
  };
}

function makeRequest(response: unknown) {
  return {
    get: vi.fn().mockResolvedValue(response),
    expand: vi.fn().mockReturnThis(),
  };
}

function makeClient(response: unknown) {
  const req = makeRequest(response);
  const client: GraphClient & { _req: typeof req } = {
    api: vi.fn().mockReturnValue(req),
    _req: req,
  };
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveItemGetNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — no expand
  // -------------------------------------------------------------------------
  it("fetches item metadata without expand when expand is absent", async () => {
    const item = rawItem({ id: "item-exact", driveId: "drive-exact" });
    const client = makeClient(item);

    const result = await getItem(client, {
      driveId: "drive-exact",
      itemId: "item-exact",
    });

    expect(client.api).toHaveBeenCalledWith("/drives/drive-exact/items/item-exact");
    expect(client._req.expand).not.toHaveBeenCalled();
    expect(result.driveId).toBe("drive-exact");
    expect(result.itemId).toBe("item-exact");
    expect(result.name).toBe("file.xlsx");
    expect(result.isFolder).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. expand query construction
  // -------------------------------------------------------------------------
  it("passes expand fields as comma-separated $expand query param", async () => {
    const expandSpy = vi.fn().mockReturnThis();
    const req = {
      get: vi.fn().mockResolvedValue(rawItem()),
      expand: expandSpy,
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    await getItem(client, {
      driveId: "drive-1",
      itemId: "item-1",
      expand: ["permissions", "listItem"],
    });

    expect(expandSpy).toHaveBeenCalledWith("permissions,listItem");
  });

  // -------------------------------------------------------------------------
  // 3. Pass-through of expanded sub-objects
  // -------------------------------------------------------------------------
  it("passes through expanded permissions and listItem opaquely", async () => {
    const mockPermissions = [{ id: "perm-1", roles: ["read"] }];
    const mockListItem = { id: "list-item-1", fields: { Title: "My Title" } };
    const item = rawItem({ permissions: mockPermissions, listItem: mockListItem });
    const client = makeClient(item);

    const result = await getItem(client, {
      driveId: "drive-1",
      itemId: "item-1",
      expand: ["permissions", "listItem"],
    });

    expect(result.permissions).toBe(mockPermissions);
    expect(result.listItem).toBe(mockListItem);
  });

  // -------------------------------------------------------------------------
  // 4. Folder item — isFolder is true, no mimeType
  // -------------------------------------------------------------------------
  it("maps folder items correctly", async () => {
    const folder = rawItem({ id: "folder-1", isFolder: true });
    const client = makeClient(folder);

    const result = await getItem(client, { driveId: "drive-1", itemId: "folder-1" });

    expect(result.isFolder).toBe(true);
    expect(result.mimeType).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. withGraphRetry integration — one 429 then success
  // -------------------------------------------------------------------------
  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const getMock = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce(rawItem({ id: "retry-item" }));

      const req = { get: getMock, expand: vi.fn().mockReturnThis() };
      const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

      const resultPromise = getItem(client, { driveId: "d", itemId: "i" });
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(result.itemId).toBe("retry-item");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 6. Node execute — integration via withClientSpy
  // -------------------------------------------------------------------------
  it("getItem pure function returns item output", async () => {
    const item = rawItem({ id: "exec-item", driveId: "exec-drive" });
    const client = makeClient(item);

    const out = await getItem(client, { driveId: "exec-drive", itemId: "exec-item" });
    expect(out.driveId).toBe("exec-drive");
    expect(out.itemId).toBe("exec-item");
  });

  // -------------------------------------------------------------------------
  // 7. Defined node credential requirements
  // -------------------------------------------------------------------------
  it("driveItemGetNode has correct auth credential slot", () => {
    const config = driveItemGetNode.create({ driveId: "d", itemId: "i" }, "Get item");
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });

  // -------------------------------------------------------------------------
  // 8. expand with empty array — no expand call
  // -------------------------------------------------------------------------
  it("does not call expand when expand is an empty array", async () => {
    const expandSpy = vi.fn().mockReturnThis();
    const req = { get: vi.fn().mockResolvedValue(rawItem()), expand: expandSpy };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    await getItem(client, { driveId: "d", itemId: "i", expand: [] });

    expect(expandSpy).not.toHaveBeenCalled();
  });
});
