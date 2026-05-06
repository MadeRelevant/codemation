/**
 * Regression #2: DriveResolveNode personalPath "/" must call /me/drive/root (bare),
 * NOT /me/drive/root:/ which Graph rejects with 404.
 */
import { describe, expect, it, vi } from "vitest";
import { resolvePersonalPath, type GraphClient } from "../../src/drive/driveResolveNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(response: unknown) {
  const req = {
    get: vi.fn().mockResolvedValue(response),
    top: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  const client: GraphClient & { _req: typeof req } = {
    api: vi.fn().mockReturnValue(req),
    _req: req,
  };
  return client;
}

function rawItem(driveId = "drive-root", id = "root-item") {
  return {
    id,
    name: "root",
    webUrl: "https://onedrive.com",
    size: 0,
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    parentReference: { driveId },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveResolveNode root path regression", () => {
  // Regression #2a: path "/" → exact URL "/me/drive/root" (no trailing colon)
  it('personalPath "/" uses exact URL /me/drive/root (not /me/drive/root:/)', async () => {
    const client = makeClient(rawItem());

    await resolvePersonalPath(client, "/");

    // Must have been called with exactly /me/drive/root
    expect(client.api).toHaveBeenCalledWith("/me/drive/root");
    // Must NOT have been called with the buggy trailing-colon form
    const calls = (client.api as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((u) => u.startsWith("/me/drive/root:"))).toBe(false);
  });

  // Regression #2b: path "/Documents" → URL with colon syntax (not bare root)
  it('personalPath "/Documents" uses /me/drive/root:/Documents (colon-path syntax)', async () => {
    const client = makeClient(rawItem("drive-1", "docs-id"));

    await resolvePersonalPath(client, "/Documents");

    // Should NOT hit bare root — path is non-empty so colon-syntax applies
    expect(client.api).toHaveBeenCalledWith("/me/drive/root:/Documents");
    expect(client.api).not.toHaveBeenCalledWith("/me/drive/root");
  });

  // Sanity: path with spaces is URL-encoded
  it('personalPath "/My Folder/foo.xlsx" encodes spaces in URL', async () => {
    const client = makeClient(rawItem("drive-2", "file-id"));

    await resolvePersonalPath(client, "/My Folder/foo.xlsx");

    expect(client.api).toHaveBeenCalledWith("/me/drive/root:/My%20Folder/foo.xlsx");
  });
});
