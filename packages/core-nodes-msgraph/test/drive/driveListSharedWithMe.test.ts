import { describe, expect, it, vi } from "vitest";
import {
  driveListSharedWithMeNode,
  type GraphClient,
  listSharedWithMe,
} from "../../src/drive/driveListSharedWithMeNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawSharedItem(
  overrides: Partial<{
    id: string;
    name: string;
    remoteId: string;
    remoteDriveId: string;
    remoteName: string;
    remoteWebUrl: string;
    remoteMimeType: string;
    isFolder: boolean;
    sharedByDisplayName: string;
    sharedByEmail: string;
    hasRemoteItem: boolean;
  }> = {},
) {
  const {
    id = "stub-1",
    name = "stub-file.xlsx",
    remoteId = "remote-item-1",
    remoteDriveId = "remote-drive-1",
    remoteName = "shared-file.xlsx",
    remoteWebUrl = "https://example.sharepoint.com/shared/file.xlsx",
    remoteMimeType = "application/vnd.ms-excel",
    isFolder = false,
    sharedByDisplayName = "Charlie Brown",
    sharedByEmail = "charlie@example.com",
    hasRemoteItem = true,
  } = overrides;

  return {
    id,
    name,
    remoteItem: hasRemoteItem
      ? {
          id: remoteId,
          name: remoteName,
          webUrl: remoteWebUrl,
          file: isFolder ? undefined : { mimeType: remoteMimeType },
          folder: isFolder ? {} : undefined,
          parentReference: { driveId: remoteDriveId },
        }
      : undefined,
    shared: {
      sharedBy: {
        user: { displayName: sharedByDisplayName, email: sharedByEmail },
      },
    },
  };
}

function makeClient(pages: unknown[]): GraphClient {
  let callCount = 0;
  return {
    api: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockImplementation(() => {
        const page = pages[callCount++] ?? { value: [] };
        return Promise.resolve(page);
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveListSharedWithMeNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — single page
  // -------------------------------------------------------------------------
  it("returns shared items from a single-page response", async () => {
    const items = [
      rawSharedItem({ remoteId: "r1", remoteDriveId: "rd1", remoteName: "alpha.xlsx" }),
      rawSharedItem({ remoteId: "r2", remoteDriveId: "rd2", remoteName: "beta.docx" }),
    ];
    const client = makeClient([{ value: items }]);

    const result = await listSharedWithMe(client);

    expect(result).toHaveLength(2);
    // Must use remote ids, NOT the local stub id
    expect(result[0]!.driveId).toBe("rd1");
    expect(result[0]!.itemId).toBe("r1");
    expect(result[0]!.name).toBe("alpha.xlsx");
    expect(result[1]!.driveId).toBe("rd2");
    expect(result[1]!.itemId).toBe("r2");
  });

  // -------------------------------------------------------------------------
  // 2. Skips entries with no remoteItem
  // -------------------------------------------------------------------------
  it("skips entries that have no remoteItem without failing", async () => {
    const items = [
      rawSharedItem({ remoteId: "r1", remoteDriveId: "rd1" }),
      rawSharedItem({ hasRemoteItem: false }), // no remoteItem — should be skipped
      rawSharedItem({ remoteId: "r3", remoteDriveId: "rd3" }),
    ];
    const client = makeClient([{ value: items }]);

    const result = await listSharedWithMe(client);

    expect(result).toHaveLength(2);
    expect(result[0]!.itemId).toBe("r1");
    expect(result[1]!.itemId).toBe("r3");
  });

  // -------------------------------------------------------------------------
  // 3. Uses remote ids — not local stub ids
  // -------------------------------------------------------------------------
  it("uses remoteItem.parentReference.driveId and remoteItem.id, not local stub id", async () => {
    const item = rawSharedItem({
      id: "local-stub-id-9999", // this must NOT appear in output
      remoteId: "real-remote-id",
      remoteDriveId: "real-remote-drive",
    });
    const client = makeClient([{ value: [item] }]);

    const result = await listSharedWithMe(client);

    expect(result[0]!.itemId).toBe("real-remote-id");
    expect(result[0]!.driveId).toBe("real-remote-drive");
    expect(result[0]!.itemId).not.toBe("local-stub-id-9999");
  });

  // -------------------------------------------------------------------------
  // 4. Folder detection
  // -------------------------------------------------------------------------
  it("correctly identifies folders", async () => {
    const items = [
      rawSharedItem({ remoteId: "folder-1", remoteDriveId: "rd1", isFolder: true }),
      rawSharedItem({ remoteId: "file-1", remoteDriveId: "rd2", isFolder: false }),
    ];
    const client = makeClient([{ value: items }]);

    const result = await listSharedWithMe(client);

    expect(result[0]!.isFolder).toBe(true);
    expect(result[0]!.mimeType).toBeUndefined();
    expect(result[1]!.isFolder).toBe(false);
    expect(result[1]!.mimeType).toBe("application/vnd.ms-excel");
  });

  // -------------------------------------------------------------------------
  // 5. Pagination — two pages
  // -------------------------------------------------------------------------
  it("auto-paginates across multiple pages", async () => {
    const page1 = {
      value: [rawSharedItem({ remoteId: "r1", remoteDriveId: "rd1" })],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$skiptoken=xyz",
    };
    const page2 = {
      value: [rawSharedItem({ remoteId: "r2", remoteDriveId: "rd2" })],
    };

    const getMock = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const client: GraphClient = { api: vi.fn().mockReturnValue({ get: getMock }) };

    const result = await listSharedWithMe(client);

    expect(result).toHaveLength(2);
    expect(result[0]!.itemId).toBe("r1");
    expect(result[1]!.itemId).toBe("r2");
    // Second call uses the nextLink URL
    expect(client.api).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$skiptoken=xyz");
  });

  // -------------------------------------------------------------------------
  // 6. sharedBy info is populated
  // -------------------------------------------------------------------------
  it("populates sharedBy from the shared.sharedBy.user field", async () => {
    const item = rawSharedItem({
      remoteId: "r1",
      remoteDriveId: "rd1",
      sharedByDisplayName: "Dave Wilson",
      sharedByEmail: "dave@example.com",
    });
    const client = makeClient([{ value: [item] }]);

    const result = await listSharedWithMe(client);

    expect(result[0]!.sharedBy?.displayName).toBe("Dave Wilson");
    expect(result[0]!.sharedBy?.email).toBe("dave@example.com");
  });

  // -------------------------------------------------------------------------
  // 7. Retry-aware — one 429 then success
  // -------------------------------------------------------------------------
  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const getMock = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce({
          value: [rawSharedItem({ remoteId: "retry-remote", remoteDriveId: "retry-drive" })],
        });

      const client: GraphClient = { api: vi.fn().mockReturnValue({ get: getMock }) };

      const resultPromise = listSharedWithMe(client);
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(result[0]!.itemId).toBe("retry-remote");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 8. Node execute — integration via withClientSpy
  // -------------------------------------------------------------------------
  it("listSharedWithMe returns one item per shared entry (pure function integration)", async () => {
    const items = [rawSharedItem({ remoteId: "exec-remote", remoteDriveId: "exec-drive" })];
    const client = makeClient([{ value: items }]);

    const result = await listSharedWithMe(client);

    expect(result).toHaveLength(1);
    expect(result[0]!.itemId).toBe("exec-remote");
    expect(result[0]!.driveId).toBe("exec-drive");
  });

  // -------------------------------------------------------------------------
  // 9. Defined node has correct credential requirements
  // -------------------------------------------------------------------------
  it("driveListSharedWithMeNode has correct auth credential slot", () => {
    const config = driveListSharedWithMeNode.create({}, "List shared with me");
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });

  // -------------------------------------------------------------------------
  // 10. Empty response
  // -------------------------------------------------------------------------
  it("returns empty items array when Graph returns no shared items", async () => {
    const client = makeClient([{ value: [] }]);
    const result = await listSharedWithMe(client);
    expect(result).toHaveLength(0);
  });
});
