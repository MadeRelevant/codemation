import { describe, expect, it, vi } from "vitest";
import { driveListMyDrivesNode, type GraphClient, listMyDrives } from "../../src/drive/driveListMyDrivesNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawDrive(
  overrides: Partial<{
    id: string;
    driveType: string;
    name: string;
    webUrl: string;
    ownerDisplayName: string;
    ownerEmail: string;
    quotaTotal: number;
    quotaUsed: number;
    quotaRemaining: number;
  }> = {},
) {
  const {
    id = "drive-1",
    driveType = "business",
    name = "OneDrive",
    webUrl = "https://example.sharepoint.com/personal/user",
    ownerDisplayName = "Alice Smith",
    ownerEmail = "alice@example.com",
    quotaTotal = 1_000_000,
    quotaUsed = 500_000,
    quotaRemaining = 500_000,
  } = overrides;
  return {
    id,
    driveType,
    name,
    webUrl,
    owner: { user: { displayName: ownerDisplayName, email: ownerEmail } },
    quota: { total: quotaTotal, used: quotaUsed, remaining: quotaRemaining },
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

describe("DriveListMyDrivesNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — single page
  // -------------------------------------------------------------------------
  it("returns all drives from a single-page response", async () => {
    const drives = [
      rawDrive({ id: "d1", driveType: "business", name: "Business Drive" }),
      rawDrive({ id: "d2", driveType: "personal", name: "Personal Drive" }),
    ];
    const client = makeClient([{ value: drives }]);

    const result = await listMyDrives(client);

    expect(result).toHaveLength(2);
    expect(result[0]!.driveId).toBe("d1");
    expect(result[0]!.driveType).toBe("business");
    expect(result[0]!.name).toBe("Business Drive");
    expect(result[1]!.driveId).toBe("d2");
    expect(result[1]!.driveType).toBe("personal");
  });

  // -------------------------------------------------------------------------
  // 2. Pagination — two pages with @odata.nextLink
  // -------------------------------------------------------------------------
  it("auto-paginates across multiple pages", async () => {
    const page1 = {
      value: [rawDrive({ id: "d1" }), rawDrive({ id: "d2" })],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drives?$skiptoken=abc",
    };
    const page2 = {
      value: [rawDrive({ id: "d3" })],
    };

    const getMock = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const client: GraphClient = { api: vi.fn().mockReturnValue({ get: getMock }) };

    const result = await listMyDrives(client);

    expect(result).toHaveLength(3);
    expect(result[0]!.driveId).toBe("d1");
    expect(result[2]!.driveId).toBe("d3");
    // Second call uses the nextLink URL
    expect(client.api).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/drives?$skiptoken=abc");
  });

  // -------------------------------------------------------------------------
  // 3. Quota and owner are preserved
  // -------------------------------------------------------------------------
  it("preserves quota and owner fields in output", async () => {
    const drive = rawDrive({
      id: "d-quota",
      quotaTotal: 2_000_000,
      quotaUsed: 800_000,
      quotaRemaining: 1_200_000,
      ownerDisplayName: "Bob Jones",
      ownerEmail: "bob@example.com",
    });
    const client = makeClient([{ value: [drive] }]);

    const result = await listMyDrives(client);

    const out = result[0]!;
    expect(out.quota?.total).toBe(2_000_000);
    expect(out.quota?.used).toBe(800_000);
    expect(out.quota?.remaining).toBe(1_200_000);
    expect(out.owner?.displayName).toBe("Bob Jones");
    expect(out.owner?.email).toBe("bob@example.com");
  });

  // -------------------------------------------------------------------------
  // 4. Empty response
  // -------------------------------------------------------------------------
  it("returns empty drives array when Graph returns no drives", async () => {
    const client = makeClient([{ value: [] }]);
    const result = await listMyDrives(client);
    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. Retry-aware — one 429 then success
  // -------------------------------------------------------------------------
  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const getMock = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce({ value: [rawDrive({ id: "retry-drive" })] });

      const client: GraphClient = { api: vi.fn().mockReturnValue({ get: getMock }) };

      const resultPromise = listMyDrives(client);
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(result[0]!.driveId).toBe("retry-drive");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 6. driveType is passed through as-is (documentLibrary etc.)
  // -------------------------------------------------------------------------
  it("passes driveType through as-is for non-standard types", async () => {
    const drive = rawDrive({ id: "d-sp", driveType: "documentLibrary", name: "SharePoint Library" });
    const client = makeClient([{ value: [drive] }]);

    const result = await listMyDrives(client);

    expect(result[0]!.driveType).toBe("documentLibrary");
  });

  // -------------------------------------------------------------------------
  // 7. Node execute — integration via listMyDrives (pure function)
  // -------------------------------------------------------------------------
  it("listMyDrives returns one item per drive (pure function integration)", async () => {
    const drives = [rawDrive({ id: "exec-drive" })];
    const client = makeClient([{ value: drives }]);

    const result = await listMyDrives(client);

    expect(result).toHaveLength(1);
    expect(result[0]!.driveId).toBe("exec-drive");
  });

  // -------------------------------------------------------------------------
  // 8. Defined node has correct credential requirements
  // -------------------------------------------------------------------------
  it("driveListMyDrivesNode has correct auth credential slot", () => {
    const config = driveListMyDrivesNode.create({}, "List my drives");
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
