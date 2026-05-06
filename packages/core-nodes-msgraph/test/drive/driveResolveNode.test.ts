import { describe, expect, it, vi } from "vitest";
import {
  driveResolveNode,
  type GraphClient,
  resolvePersonalPath,
  resolveSharedLink,
  resolveDriveItem,
  resolveSharedWithMe,
  resolveByName,
} from "../../src/drive/driveResolveNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal graph API request mock. `get` resolves to `response`. */
function makeRequest(response: unknown, spyOnFilter?: ReturnType<typeof vi.fn>) {
  const req = {
    get: vi.fn().mockResolvedValue(response),
    top: vi.fn().mockReturnThis(),
    filter: spyOnFilter ?? vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  return req;
}

/** Build a minimal fake GraphClient that returns `request` for every `.api()` call. */
function makeClient(response: unknown, spyOnFilter?: ReturnType<typeof vi.fn>) {
  const req = makeRequest(response, spyOnFilter);
  const client: GraphClient & { _req: typeof req } = {
    api: vi.fn().mockReturnValue(req),
    _req: req,
  };
  return client;
}

/** A canonical-looking raw driveItem response from Graph. */
function rawItem(
  overrides: Partial<{
    id: string;
    name: string;
    webUrl: string;
    size: number;
    lastModifiedDateTime: string;
    mimeType: string;
    driveId: string;
  }> = {},
): Record<string, unknown> {
  const {
    id = "item-123",
    name = "foo.xlsx",
    webUrl = "https://contoso.sharepoint.com/path/foo.xlsx",
    size = 1024,
    lastModifiedDateTime = "2026-01-01T00:00:00Z",
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    driveId = "drive-abc",
  } = overrides;

  return {
    id,
    name,
    webUrl,
    size,
    lastModifiedDateTime,
    file: { mimeType },
    parentReference: { driveId },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveResolveNode", () => {
  // -------------------------------------------------------------------------
  // 1. personalPath happy path
  // -------------------------------------------------------------------------
  it("personalPath: resolves path and URL-encodes segments (with and without leading slash)", async () => {
    const item = rawItem({ id: "item-1", driveId: "drive-1", name: "My File.xlsx" });
    const client = makeClient(item);

    const out = await resolvePersonalPath(client, "/Documents/My File.xlsx");

    // API must have been called with the root:/{path} syntax
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/me/drive/root:/Documents/My%20File.xlsx"));
    expect(out.driveId).toBe("drive-1");
    expect(out.itemId).toBe("item-1");
    expect(out.name).toBe("My File.xlsx");
    expect(out.isShared).toBe(false);
  });

  it("personalPath: path without leading slash is normalised correctly", async () => {
    const item = rawItem({ id: "item-2", driveId: "drive-2" });
    const client = makeClient(item);

    await resolvePersonalPath(client, "Documents/foo.xlsx");

    // Must be called with a leading slash before Documents
    expect(client.api).toHaveBeenCalledWith("/me/drive/root:/Documents/foo.xlsx");
  });

  // -------------------------------------------------------------------------
  // 2. sharedLink happy path — assert base64url encoding
  // -------------------------------------------------------------------------
  it("sharedLink: encodes URL as u!{base64url} share token", async () => {
    const shareUrl = "https://contoso.sharepoint.com/:x:/s/team/ABCD+EF/GH==";
    const item = rawItem({ driveId: "drive-shared" });
    const client = makeClient(item);

    // Compute expected token manually
    const raw64 = Buffer.from(shareUrl, "utf8").toString("base64");
    const expectedToken = "u!" + raw64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const out = await resolveSharedLink(client, shareUrl);

    expect(client.api).toHaveBeenCalledWith(`/shares/${expectedToken}/driveItem`);
    expect(out.isShared).toBe(true);
    expect(out.driveId).toBe("drive-shared");
  });

  // -------------------------------------------------------------------------
  // 3. driveItem happy path — validates via GET
  // -------------------------------------------------------------------------
  it("driveItem: calls GET on the canonical drive path and returns metadata", async () => {
    const item = rawItem({ id: "item-exact", driveId: "drive-exact" });
    const client = makeClient(item);

    const out = await resolveDriveItem(client, "drive-exact", "item-exact");

    // Exactly one API call
    expect(client.api).toHaveBeenCalledTimes(1);
    expect(client.api).toHaveBeenCalledWith("/drives/drive-exact/items/item-exact");
    expect(out.driveId).toBe("drive-exact");
    expect(out.itemId).toBe("item-exact");
    expect(out.isShared).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. sharedWithMe happy path — uses remoteItem ids
  // -------------------------------------------------------------------------
  it("sharedWithMe: returns remoteItem driveId and id, not the local stub ids", async () => {
    // The local stub has a DIFFERENT id from the remote item — tests the footgun fix
    const sharedList = {
      value: [
        {
          id: "LOCAL-STUB-ID", // must NOT appear in output
          name: "Inventory Drop",
          webUrl: "https://contoso.sharepoint.com/path",
          parentReference: { driveId: "LOCAL-DRIVE-ID" }, // must NOT appear in output
          remoteItem: {
            id: "REMOTE-ITEM-ID",
            name: "Inventory Drop",
            webUrl: "https://contoso.sharepoint.com/real-path",
            size: 2048,
            lastModifiedDateTime: "2026-04-01T12:00:00Z",
            file: { mimeType: "application/vnd.ms-excel" },
            parentReference: { driveId: "REMOTE-DRIVE-ID" },
          },
        },
      ],
    };

    const client = makeClient(sharedList);

    const out = await resolveSharedWithMe(client, "Inventory Drop");

    expect(out.driveId).toBe("REMOTE-DRIVE-ID"); // remote, not local
    expect(out.itemId).toBe("REMOTE-ITEM-ID"); // remote, not local
    expect(out.isShared).toBe(true);
    expect(out.name).toBe("Inventory Drop");
    expect(out.size).toBe(2048);
  });

  // -------------------------------------------------------------------------
  // 5. sharedWithMe error — entry has no remoteItem
  // -------------------------------------------------------------------------
  it("sharedWithMe: throws with clear message when entry has no remoteItem", async () => {
    const sharedList = {
      value: [
        {
          id: "stub-id",
          name: "Orphaned Item",
          // no remoteItem
        },
      ],
    };

    const client = makeClient(sharedList);

    await expect(resolveSharedWithMe(client, "Orphaned Item")).rejects.toThrow(/remoteItem/);
  });

  // -------------------------------------------------------------------------
  // 6. sharedWithMe not found
  // -------------------------------------------------------------------------
  it("sharedWithMe: throws when no entry matches the name", async () => {
    const client = makeClient({ value: [] });

    await expect(resolveSharedWithMe(client, "Nonexistent")).rejects.toThrow(/no shared-with-me entry found/);
  });

  it("sharedWithMe: throws when name present but no match in the list", async () => {
    const client = makeClient({ value: [{ id: "x", name: "Other Thing" }] });

    await expect(resolveSharedWithMe(client, "Missing")).rejects.toThrow(/no shared-with-me entry found/);
  });

  // -------------------------------------------------------------------------
  // 7. byName happy path
  // -------------------------------------------------------------------------
  it("byName: returns first matching child", async () => {
    const item = rawItem({ id: "child-1", driveId: "drive-parent" });
    const client = makeClient({ value: [item] });

    const out = await resolveByName(client, "drive-parent", "folder-root", "foo.xlsx");

    expect(client.api).toHaveBeenCalledWith("/drives/drive-parent/items/folder-root/children");
    expect(out.itemId).toBe("child-1");
    expect(out.isShared).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. byName quote-escaping
  // -------------------------------------------------------------------------
  it("byName: escapes single-quotes in name for OData filter", async () => {
    const item = rawItem({ id: "obrien-item", name: "O'Brien Report", driveId: "drive-q" });
    const filterSpy = vi.fn().mockReturnThis();
    const req = {
      get: vi.fn().mockResolvedValue({ value: [item] }),
      top: vi.fn().mockReturnThis(),
      filter: filterSpy,
      select: vi.fn().mockReturnThis(),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

    await resolveByName(client, "drive-q", "folder-id", "O'Brien Report");

    // OData filter must double the single quote
    expect(filterSpy).toHaveBeenCalledWith("name eq 'O''Brien Report'");
  });

  // -------------------------------------------------------------------------
  // 9. Output shape parity — two different variants produce identical key sets
  // -------------------------------------------------------------------------
  it("output shape: personalPath and sharedWithMe produce identical key sets", async () => {
    const personalItem = rawItem({ id: "p-item", driveId: "p-drive" });
    const clientPersonal = makeClient(personalItem);

    const sharedList = {
      value: [
        {
          id: "local-id",
          name: "Shared Doc",
          remoteItem: {
            id: "remote-id",
            name: "Shared Doc",
            webUrl: "https://example.com",
            size: 512,
            lastModifiedDateTime: "2026-01-01T00:00:00Z",
            file: { mimeType: "application/pdf" },
            parentReference: { driveId: "remote-drive" },
          },
        },
      ],
    };
    const clientShared = makeClient(sharedList);

    const outPersonal = await resolvePersonalPath(clientPersonal, "/test.xlsx");
    const outShared = await resolveSharedWithMe(clientShared, "Shared Doc");

    const keysPersonal = Object.keys(outPersonal).sort();
    const keysShared = Object.keys(outShared).sort();
    expect(keysPersonal).toEqual(keysShared);
  });

  // -------------------------------------------------------------------------
  // 10. withGraphRetry integration — one 429 then success
  // -------------------------------------------------------------------------
  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const item = rawItem({ driveId: "drive-retry" });
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const req = {
        get: vi.fn().mockRejectedValueOnce(throttleErr).mockResolvedValueOnce(item),
        top: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
      };
      const client: GraphClient = { api: vi.fn().mockReturnValue(req) };

      const resultPromise = resolvePersonalPath(client, "/retry.xlsx");

      // Advance past the retry delay (withGraphRetry default baseDelayMs=250, jitter range 187-312ms)
      await vi.advanceTimersByTimeAsync(500);

      const out = await resultPromise;
      expect(req.get).toHaveBeenCalledTimes(2);
      expect(out.driveId).toBe("drive-retry");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 11. isShared flag — true for sharedLink + sharedWithMe; false for others
  // -------------------------------------------------------------------------
  it("isShared is true for sharedLink and sharedWithMe, false for personalPath/driveItem/byName", async () => {
    const item = rawItem({ driveId: "drive-x" });

    // personalPath
    const outPersonal = await resolvePersonalPath(makeClient(item), "/x.xlsx");
    expect(outPersonal.isShared).toBe(false);

    // driveItem
    const outDriveItem = await resolveDriveItem(makeClient(item), "drive-x", "item-x");
    expect(outDriveItem.isShared).toBe(false);

    // byName
    const outByName = await resolveByName(makeClient({ value: [item] }), "drive-x", "folder-x", "x.xlsx");
    expect(outByName.isShared).toBe(false);

    // sharedLink
    const outSharedLink = await resolveSharedLink(makeClient(item), "https://share.example.com/x");
    expect(outSharedLink.isShared).toBe(true);

    // sharedWithMe
    const sharedWithMeResponse = {
      value: [
        {
          id: "local",
          name: "Shared X",
          remoteItem: {
            id: "remote",
            name: "Shared X",
            webUrl: "https://example.com",
            file: { mimeType: "application/octet-stream" },
            parentReference: { driveId: "drive-remote" },
          },
        },
      ],
    };
    const outSharedWithMe = await resolveSharedWithMe(makeClient(sharedWithMeResponse), "Shared X");
    expect(outSharedWithMe.isShared).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Defined node credential requirements
  // -------------------------------------------------------------------------
  it("driveResolveNode has correct auth credential slot", () => {
    const config = driveResolveNode.create(
      { input: { kind: "personalPath", path: "/test.xlsx" } },
      "Resolve drive item",
    );
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
