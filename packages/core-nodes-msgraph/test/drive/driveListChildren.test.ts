import { describe, expect, it, vi } from "vitest";
import {
  DriveListChildren,
  DriveListChildrenNode,
  type GraphClient,
  listChildren,
} from "../../src/drive/driveListChildrenNode";
import type { DriveChildItem } from "../../src/drive/driveItemMapper";

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
  }> = {},
) {
  const {
    id = "item-1",
    name = "file.xlsx",
    webUrl = "https://example.com/file.xlsx",
    size = 1024,
    mimeType = "application/vnd.ms-excel",
    driveId = "drive-abc",
    isFolder = false,
  } = overrides;
  return {
    id,
    name,
    webUrl,
    size,
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    file: isFolder ? undefined : { mimeType },
    folder: isFolder ? {} : undefined,
    parentReference: { driveId },
  };
}

function makeRequest(response: unknown) {
  return {
    get: vi.fn().mockResolvedValue(response),
    top: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    orderby: vi.fn().mockReturnThis(),
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

function makeArgs(cfg: ConstructorParameters<typeof DriveListChildren>[1]) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  const ctx = {
    config: new DriveListChildren("list", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary: { attach: vi.fn(), withAttachment: vi.fn(), openReadStream: vi.fn() },
  };
  return {
    item: { json: {} },
    ctx: ctx as never,
    input: {} as never,
    itemIndex: 0,
    items: [] as never,
  };
}

async function withClientSpy<T>(client: GraphClient, fn: () => Promise<T>): Promise<T> {
  const mod = await import("../../src/credentials/session");
  const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveListChildrenNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — single page
  // -------------------------------------------------------------------------
  it("returns items from a single-page response", async () => {
    const items = [rawItem({ id: "a", name: "alpha.xlsx" }), rawItem({ id: "b", name: "beta.docx", isFolder: false })];
    const client = makeClient({ value: items });

    const result = await listChildren(client, {
      driveId: "drive-1",
      itemId: "folder-1",
      top: 200,
      maxItems: 1000,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.itemId).toBe("a");
    expect(result[0]!.name).toBe("alpha.xlsx");
    expect(result[0]!.isFolder).toBe(false);
    expect(result[1]!.itemId).toBe("b");
  });

  // -------------------------------------------------------------------------
  // 2. itemId === "root" — uses /root/children path
  // -------------------------------------------------------------------------
  it("uses /root/children path when itemId is 'root'", async () => {
    const client = makeClient({ value: [] });

    await listChildren(client, {
      driveId: "drive-root",
      itemId: "root",
      top: 200,
      maxItems: 1000,
    });

    expect(client.api).toHaveBeenCalledWith("/drives/drive-root/root/children");
  });

  // -------------------------------------------------------------------------
  // 3. Regular itemId uses /items/{itemId}/children path
  // -------------------------------------------------------------------------
  it("uses /items/{itemId}/children path for regular itemIds", async () => {
    const client = makeClient({ value: [] });

    await listChildren(client, {
      driveId: "drive-1",
      itemId: "folder-99",
      top: 200,
      maxItems: 1000,
    });

    expect(client.api).toHaveBeenCalledWith("/drives/drive-1/items/folder-99/children");
  });

  // -------------------------------------------------------------------------
  // 4. $filter and $orderby interpolation
  // -------------------------------------------------------------------------
  it("applies $filter and $orderby when provided", async () => {
    const req = makeRequest({ value: [] });
    const filterSpy = vi.fn().mockReturnValue(req);
    const orderbySpy = vi.fn().mockReturnValue(req);
    req.filter = filterSpy;
    req.orderby = orderbySpy;

    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    await listChildren(client, {
      driveId: "drive-1",
      itemId: "folder-1",
      filter: "startsWith(name,'Stock')",
      orderBy: "lastModifiedDateTime desc",
      top: 50,
      maxItems: 1000,
    });

    expect(filterSpy).toHaveBeenCalledWith("startsWith(name,'Stock')");
    expect(orderbySpy).toHaveBeenCalledWith("lastModifiedDateTime desc");
  });

  // -------------------------------------------------------------------------
  // 5. Pagination — two pages with @odata.nextLink
  // -------------------------------------------------------------------------
  it("auto-paginates when @odata.nextLink is present", async () => {
    const page1Items = [rawItem({ id: "p1-a" }), rawItem({ id: "p1-b" })];
    const page2Items = [rawItem({ id: "p2-a" })];

    const page1Response = {
      value: page1Items,
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/drives/d1/items/f1/children?$skiptoken=abc",
    };
    const page2Response = { value: page2Items };

    // First call returns page1, second call returns page2
    const getMock = vi.fn().mockResolvedValueOnce(page1Response).mockResolvedValueOnce(page2Response);

    const req = {
      get: getMock,
      top: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockReturnThis(),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    const result = await listChildren(client, {
      driveId: "drive-1",
      itemId: "folder-1",
      top: 2,
      maxItems: 1000,
    });

    expect(result).toHaveLength(3);
    expect(result[0]!.itemId).toBe("p1-a");
    expect(result[2]!.itemId).toBe("p2-a");
    // Second call must use the nextLink URL
    expect(client.api).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/drives/d1/items/f1/children?$skiptoken=abc",
    );
  });

  // -------------------------------------------------------------------------
  // 6. maxItems truncation
  // -------------------------------------------------------------------------
  it("stops collecting when maxItems is reached", async () => {
    const page1Items = [rawItem({ id: "a" }), rawItem({ id: "b" }), rawItem({ id: "c" })];
    const page1Response = {
      value: page1Items,
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
    };

    const client = makeClient(page1Response);

    const result = await listChildren(client, {
      driveId: "drive-1",
      itemId: "folder-1",
      top: 200,
      maxItems: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.itemId).toBe("a");
    expect(result[1]!.itemId).toBe("b");
  });

  // -------------------------------------------------------------------------
  // 7. isFolder detection
  // -------------------------------------------------------------------------
  it("correctly identifies folder vs file via isFolder field", async () => {
    const items = [rawItem({ id: "folder-item", isFolder: true }), rawItem({ id: "file-item", isFolder: false })];
    const client = makeClient({ value: items });

    const result = await listChildren(client, {
      driveId: "d",
      itemId: "f",
      top: 200,
      maxItems: 1000,
    });

    expect(result[0]!.isFolder).toBe(true);
    expect(result[1]!.isFolder).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. withGraphRetry integration — one 429 then success
  // -------------------------------------------------------------------------
  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const getMock = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce({ value: [rawItem({ id: "retry-item" })] });

      const req = {
        get: getMock,
        top: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        orderby: vi.fn().mockReturnThis(),
      };
      const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

      const resultPromise = listChildren(client, {
        driveId: "d",
        itemId: "f",
        top: 200,
        maxItems: 1000,
      });

      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(result[0]!.itemId).toBe("retry-item");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 9. Node execute — integration via withClientSpy
  // -------------------------------------------------------------------------
  it("node execute returns one item per child", async () => {
    const items = [rawItem({ id: "node-item" })];
    const client = makeClient({ value: items });

    const node = new DriveListChildrenNode();
    const result = await withClientSpy(client, () =>
      node.execute(makeArgs({ driveId: "drive-1", itemId: "folder-1" })),
    );

    const emitted = result as DriveChildItem[];
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.itemId).toBe("node-item");
  });

  // -------------------------------------------------------------------------
  // 10. Config class
  // -------------------------------------------------------------------------
  it("DriveListChildren config declares correct credential requirements", () => {
    const cfg = new DriveListChildren("list", { driveId: "d", itemId: "f" });
    const creds = cfg.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });

  // -------------------------------------------------------------------------
  // 11. fallback driveId when parentReference.driveId is absent
  // -------------------------------------------------------------------------
  it("uses fallback driveId when item parentReference.driveId is absent", async () => {
    const item = { id: "item-no-drive", name: "orphan.txt", webUrl: "https://example.com" };
    const client = makeClient({ value: [item] });

    const result = await listChildren(client, {
      driveId: "fallback-drive",
      itemId: "folder-1",
      top: 200,
      maxItems: 1000,
    });

    expect(result[0]!.driveId).toBe("fallback-drive");
  });
});
