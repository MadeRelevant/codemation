import { describe, expect, it, vi } from "vitest";
import { DriveCopy, DriveCopyNode, type CopyHttp, type DriveCopyOutput, copyItem } from "../../src/drive/driveCopyNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawMetadata(
  overrides: Partial<{
    id: string;
    name: string;
    webUrl: string;
    size: number;
    mimeType: string;
    driveId: string;
  }> = {},
) {
  const {
    id = "copied-item-1",
    name = "copy-of-file.xlsx",
    webUrl = "https://example.com/copy-of-file.xlsx",
    size = 4096,
    mimeType = "application/vnd.ms-excel",
    driveId = "target-drive",
  } = overrides;
  return {
    id,
    name,
    webUrl,
    size,
    lastModifiedDateTime: "2026-05-01T00:00:00Z",
    file: { mimeType },
    folder: undefined,
    parentReference: { driveId },
  };
}

function makeSession() {
  return { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };
}

function makeCopyHttp(overrides: Partial<CopyHttp> = {}): CopyHttp {
  return {
    postCopy: vi.fn().mockResolvedValue({ monitorUrl: "https://monitor.example.com/op-1" }),
    fetchMonitor: vi.fn().mockResolvedValue({ status: "completed", resourceId: "copied-item-1" }),
    fetchMetadata: vi.fn().mockResolvedValue(rawMetadata()),
    ...overrides,
  };
}

function makeArgs(cfg: ConstructorParameters<typeof DriveCopy>[1]) {
  const session = makeSession();
  const ctx = {
    config: new DriveCopy("copy", cfg),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveCopyNode", () => {
  // -------------------------------------------------------------------------
  // 1. awaitCompletion: false — returns pending shape immediately
  // -------------------------------------------------------------------------
  it("returns pending shape without polling when awaitCompletion is false", async () => {
    const copyHttp = makeCopyHttp();

    const result = await copyItem({
      copyHttp,
      session: makeSession(),
      sourceDriveId: "src-drive",
      sourceItemId: "src-item",
      targetDriveId: "tgt-drive",
      targetParentItemId: "tgt-folder",
      awaitCompletion: false,
      pollIntervalMs: 1000,
      timeoutMs: 60_000,
      sleep: async () => {},
    });

    expect(result.status).toBe("pending");
    const pending = result as Extract<DriveCopyOutput, { status: "pending" }>;
    expect(pending.monitorUrl).toBe("https://monitor.example.com/op-1");
    expect(pending.sourceDriveId).toBe("src-drive");
    expect(pending.sourceItemId).toBe("src-item");

    // Must not poll or fetch metadata
    expect(copyHttp.fetchMonitor as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(copyHttp.fetchMetadata as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Happy path — awaitCompletion: true, immediate completed
  // -------------------------------------------------------------------------
  it("polls once, gets completed, fetches metadata, returns canonical shape", async () => {
    const copyHttp = makeCopyHttp({
      fetchMonitor: vi.fn().mockResolvedValue({ status: "completed", resourceId: "copied-item-1" }),
    });

    const result = await copyItem({
      copyHttp,
      session: makeSession(),
      sourceDriveId: "src-drive",
      sourceItemId: "src-item",
      targetDriveId: "target-drive",
      targetParentItemId: "tgt-folder",
      awaitCompletion: true,
      pollIntervalMs: 1000,
      timeoutMs: 60_000,
      sleep: async () => {},
    });

    expect(result.status).toBe("completed");
    const completed = result as Extract<DriveCopyOutput, { status: "completed" }>;
    expect(completed.driveId).toBe("target-drive");
    expect(completed.itemId).toBe("copied-item-1");
    expect(completed.name).toBe("copy-of-file.xlsx");
    expect(completed.isFolder).toBe(false);
    expect(completed.mimeType).toBe("application/vnd.ms-excel");

    // Metadata must be fetched with targetDriveId + resourceId
    expect(copyHttp.fetchMetadata).toHaveBeenCalledWith({
      driveId: "target-drive",
      itemId: "copied-item-1",
      session: expect.anything(),
    });
  });

  // -------------------------------------------------------------------------
  // 3. Polling — inProgress then completed
  // -------------------------------------------------------------------------
  it("polls through inProgress states before reaching completed", async () => {
    const fetchMonitor = vi
      .fn()
      .mockResolvedValueOnce({ status: "notStarted", percentageComplete: 0 })
      .mockResolvedValueOnce({ status: "inProgress", percentageComplete: 50 })
      .mockResolvedValueOnce({ status: "completed", resourceId: "item-xyz" });

    const copyHttp = makeCopyHttp({
      fetchMonitor,
      fetchMetadata: vi.fn().mockResolvedValue(rawMetadata({ id: "item-xyz" })),
    });

    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    const result = await copyItem({
      copyHttp,
      session: makeSession(),
      sourceDriveId: "s",
      sourceItemId: "si",
      targetDriveId: "t",
      targetParentItemId: "tf",
      awaitCompletion: true,
      pollIntervalMs: 500,
      timeoutMs: 60_000,
      sleep: sleepSpy,
    });

    expect(fetchMonitor).toHaveBeenCalledTimes(3);
    // Sleep called between polls (not before the first, not after completed)
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(500);
    expect(result.status).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // 4. Failed status — throws with Graph error
  // -------------------------------------------------------------------------
  it("throws when monitor returns failed status", async () => {
    const copyHttp = makeCopyHttp({
      fetchMonitor: vi.fn().mockResolvedValue({
        status: "failed",
        error: { code: "generalException", message: "Disk quota exceeded" },
      }),
    });

    await expect(
      copyItem({
        copyHttp,
        session: makeSession(),
        sourceDriveId: "s",
        sourceItemId: "si",
        targetDriveId: "t",
        targetParentItemId: "tf",
        awaitCompletion: true,
        pollIntervalMs: 1000,
        timeoutMs: 60_000,
        sleep: async () => {},
      }),
    ).rejects.toThrow("generalException");
  });

  // -------------------------------------------------------------------------
  // 5. Timeout — polling never reaches completed within timeoutMs
  // -------------------------------------------------------------------------
  it("throws a timeout error when polling never reaches completed", async () => {
    // Inject a `now` function that advances with each call
    let tick = 0;
    const now = () => {
      // Starts at 0, jumps past timeoutMs on the 3rd call (after 2 polls)
      const times = [0, 0, 500, 1500]; // deadline check happens before sleep
      return times[tick++] ?? 2000;
    };

    const copyHttp = makeCopyHttp({
      fetchMonitor: vi.fn().mockResolvedValue({ status: "inProgress", percentageComplete: 10 }),
    });

    await expect(
      copyItem({
        copyHttp,
        session: makeSession(),
        sourceDriveId: "s",
        sourceItemId: "si",
        targetDriveId: "t",
        targetParentItemId: "tf",
        awaitCompletion: true,
        pollIntervalMs: 500,
        timeoutMs: 1000, // deadline = now() + 1000 = 0 + 1000 = 1000
        sleep: async () => {},
        now,
      }),
    ).rejects.toThrow(/timed out/);
  });

  // -------------------------------------------------------------------------
  // 6. Retry-aware — one 429 on fetchMonitor, then completed
  // -------------------------------------------------------------------------
  it("retries monitor fetch on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const fetchMonitor = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce({ status: "completed", resourceId: "retried-item" });

      const copyHttp = makeCopyHttp({
        fetchMonitor,
        fetchMetadata: vi.fn().mockResolvedValue(rawMetadata({ id: "retried-item" })),
      });

      const resultPromise = copyItem({
        copyHttp,
        session: makeSession(),
        sourceDriveId: "s",
        sourceItemId: "si",
        targetDriveId: "t",
        targetParentItemId: "tf",
        awaitCompletion: true,
        pollIntervalMs: 100,
        timeoutMs: 60_000,
        sleep: async () => {},
      });

      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(fetchMonitor).toHaveBeenCalledTimes(2);
      expect(result.status).toBe("completed");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 7. name parameter is forwarded
  // -------------------------------------------------------------------------
  it("forwards the name parameter to postCopy", async () => {
    const copyHttp = makeCopyHttp();

    await copyItem({
      copyHttp,
      session: makeSession(),
      sourceDriveId: "s",
      sourceItemId: "si",
      targetDriveId: "t",
      targetParentItemId: "tf",
      name: "renamed-file.xlsx",
      awaitCompletion: false,
      pollIntervalMs: 1000,
      timeoutMs: 60_000,
      sleep: async () => {},
    });

    expect(copyHttp.postCopy).toHaveBeenCalledWith(expect.objectContaining({ name: "renamed-file.xlsx" }));
  });

  // -------------------------------------------------------------------------
  // 8. Node execute — integration
  // -------------------------------------------------------------------------
  it("node execute returns item with json output", async () => {
    const copyHttp = makeCopyHttp();
    const node = new DriveCopyNode(copyHttp, { sleep: async () => {} });

    const result = await node.execute(
      makeArgs({
        sourceDriveId: "src",
        sourceItemId: "si",
        targetDriveId: "tgt",
        targetParentItemId: "tf",
        awaitCompletion: true,
      }),
    );

    const out = (result as { json: DriveCopyOutput }).json;
    expect(out.status).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // 9. Config class
  // -------------------------------------------------------------------------
  it("DriveCopy config declares correct credential requirements", () => {
    const cfg = new DriveCopy("copy", {
      sourceDriveId: "s",
      sourceItemId: "si",
      targetDriveId: "t",
      targetParentItemId: "tf",
    });
    const creds = cfg.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
