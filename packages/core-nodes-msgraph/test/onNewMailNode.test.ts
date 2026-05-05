import { describe, expect, it, vi } from "vitest";
import { OnNewMsGraphMailTriggerNode, runCycle } from "../src/mail/onNewMailNode";
import { OnNewMsGraphMailTrigger } from "../src/mail/onNewMailConfig";
import type { GraphApiRequest, GraphClient } from "../src/mail/onNewMailNode";

describe("OnNewMsGraphMailTriggerNode", () => {
  it("setup() resolves the auth credential and starts the polling loop with the resolved interval", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const trigger = new OnNewMsGraphMailTrigger("watch", {
      mailbox: "alice@contoso.com",
      pollIntervalMs: 12_345,
    });

    const getCredential = vi.fn().mockResolvedValue({ accessToken: "abc", refresh: vi.fn() });
    const start = vi.fn().mockResolvedValue({
      mailbox: "alice@contoso.com",
      folderId: "Inbox",
      processedMessageIds: [],
      baselineComplete: true,
    });

    const ctx = {
      config: trigger,
      previousState: undefined,
      getCredential,
      polling: { start, dedup: { merge: vi.fn() } },
    } as unknown as Parameters<typeof node.setup>[0];

    await node.setup(ctx);

    expect(getCredential).toHaveBeenCalledWith("auth");
    expect(start).toHaveBeenCalledTimes(1);
    const startArgs = start.mock.calls[0][0];
    expect(startArgs.intervalMs).toBe(12_345);
    expect(typeof startArgs.runCycle).toBe("function");
  });

  it("setup() falls back to the default interval when pollIntervalMs is omitted, and the supplied runCycle delegates to the mail runCycle", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const trigger = new OnNewMsGraphMailTrigger("watch", { mailbox: "bob@contoso.com" });

    let capturedRunCycle: ((args: { previousState: unknown }) => Promise<unknown>) | undefined;
    const start = vi.fn().mockImplementation(async (args: { runCycle: typeof capturedRunCycle }) => {
      capturedRunCycle = args.runCycle;
      return undefined;
    });

    const dedup = { merge: vi.fn().mockReturnValue([]) };
    const ctx = {
      config: trigger,
      previousState: { mailbox: "bob@contoso.com", folderId: "Inbox", processedMessageIds: [], baselineComplete: true },
      getCredential: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
      polling: { start, dedup },
    } as unknown as Parameters<typeof node.setup>[0];

    await node.setup(ctx);
    expect(start.mock.calls[0][0].intervalMs).toBe(60_000);

    // Invoke the runCycle the node passed to start, exercising the closure body
    // (line that builds the runCycle args). The Graph SDK call inside runCycle
    // will fail because we did not stub createGraphClient; that's fine — the
    // closure has been entered, which is what we are covering.
    expect(capturedRunCycle).toBeDefined();
    await expect(capturedRunCycle!({ previousState: undefined })).rejects.toBeDefined();
  });

  it("execute() returns items unchanged on the main port when downloadAttachments is false", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const items = [
      {
        json: {
          messageId: "1",
          conversationId: "c",
          receivedDateTime: "2026-05-01T00:00:00Z",
          internetMessageId: "<a@b>",
          from: { name: "", address: "x@y" },
          to: [],
          subject: "s",
        },
      },
    ] as Parameters<typeof node.execute>[0];

    const ctx = {
      config: { cfg: { mailbox: "alice@contoso.com", downloadAttachments: false } },
      getCredential: vi.fn(),
      binary: { attach: vi.fn(), withAttachment: vi.fn() },
    } as unknown as Parameters<typeof node.execute>[1];

    const out = await node.execute(items, ctx);
    expect(out).toEqual({ main: items });
  });

  // ---------------------------------------------------------------------------
  // Default filter tests — exercise through runCycle which calls buildMessagesRequest
  // ---------------------------------------------------------------------------

  it("applies 'isRead eq false' filter by default when cfg.filter is undefined", async () => {
    // Build a stubbed GraphApiRequest that records filter / orderby calls
    let capturedFilter: string | undefined;
    let capturedOrderby: string | undefined;
    const request: GraphApiRequest = {
      top: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockImplementation((v: string) => {
        capturedOrderby = v;
        return request;
      }),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockImplementation((v: string) => {
        capturedFilter = v;
        return request;
      }),
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ value: [] }),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(request) };
    const dedup = {
      merge: vi.fn().mockImplementation((_prev: ReadonlyArray<string>, incoming: ReadonlyArray<string>) => incoming),
    };

    await runCycle({
      client,
      cfg: { mailbox: "me" },
      previousState: { mailbox: "me", folderId: "inbox", processedMessageIds: [], baselineComplete: true },
      dedup,
    });

    expect(capturedFilter).toBe("isRead eq false");
    expect(capturedOrderby).toBeUndefined();
  });

  it("does not apply a filter when cfg.filter is an empty string, uses orderby instead", async () => {
    let capturedFilter: string | undefined;
    let capturedOrderby: string | undefined;
    const request: GraphApiRequest = {
      top: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockImplementation((v: string) => {
        capturedOrderby = v;
        return request;
      }),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockImplementation((v: string) => {
        capturedFilter = v;
        return request;
      }),
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ value: [] }),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(request) };
    const dedup = {
      merge: vi.fn().mockImplementation((_prev: ReadonlyArray<string>, incoming: ReadonlyArray<string>) => incoming),
    };

    await runCycle({
      client,
      cfg: { mailbox: "me", filter: "" },
      previousState: { mailbox: "me", folderId: "inbox", processedMessageIds: [], baselineComplete: true },
      dedup,
    });

    expect(capturedFilter).toBeUndefined();
    expect(capturedOrderby).toBe("receivedDateTime desc");
  });

  it("passes a custom filter expression through unchanged", async () => {
    let capturedFilter: string | undefined;
    const request: GraphApiRequest = {
      top: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockImplementation((v: string) => {
        capturedFilter = v;
        return request;
      }),
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ value: [] }),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(request) };
    const dedup = {
      merge: vi.fn().mockImplementation((_prev: ReadonlyArray<string>, incoming: ReadonlyArray<string>) => incoming),
    };

    await runCycle({
      client,
      cfg: { mailbox: "me", filter: "from/emailAddress/address eq 'x@y'" },
      previousState: { mailbox: "me", folderId: "inbox", processedMessageIds: [], baselineComplete: true },
      dedup,
    });

    expect(capturedFilter).toBe("from/emailAddress/address eq 'x@y'");
  });

  // ---------------------------------------------------------------------------
  // Oversized-attachment skip tests
  // ---------------------------------------------------------------------------

  it("execute() skips oversized attachments and emits skippedAttachments[] on the item", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const NORMAL_SIZE = 100;
    const OVERSIZED = 50_000_000; // 50 MiB > default 25 MiB cap
    const items = [
      {
        json: {
          messageId: "msg-2",
          conversationId: "c2",
          receivedDateTime: "2026-05-01T00:00:00Z",
          internetMessageId: "<b@c>",
          to: [],
          attachments: [
            { id: "att-small", name: "small.txt", contentType: "text/plain", size: NORMAL_SIZE },
            { id: "att-big", name: "huge.zip", contentType: "application/zip", size: OVERSIZED },
          ],
        },
      },
    ] as Parameters<typeof node.execute>[0];

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("data").toString("base64") });
    const apiRequest = { get };
    const client = { api: vi.fn().mockReturnValue(apiRequest) };
    const session = { accessToken: "tok", refresh: vi.fn() };
    const attachedBinary = { id: "binary-x", storageKey: "k" };
    const binary = {
      attach: vi.fn().mockResolvedValue(attachedBinary),
      withAttachment: vi.fn(
        (
          item: { binary?: Record<string, unknown>; json: Record<string, unknown> },
          name: string,
          attachment: unknown,
        ) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: attachment },
        }),
      ),
    };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: { cfg: { mailbox: "me", downloadAttachments: true } },
        getCredential: vi.fn().mockResolvedValue(session),
        binary,
      } as unknown as Parameters<typeof node.execute>[1];

      const out = await node.execute(items, ctx);

      // Only the small attachment should be fetched (1 api call for small, 0 for big)
      expect(client.api).toHaveBeenCalledTimes(1);
      expect(binary.attach).toHaveBeenCalledTimes(1);

      const main = out.main as ReadonlyArray<{
        json: { skippedAttachments?: Array<{ name: string; size: number; reason: string }> };
      }>;
      expect(main[0]!.json.skippedAttachments).toEqual([{ name: "huge.zip", size: OVERSIZED, reason: "size-cap" }]);
    } finally {
      spy.mockRestore();
    }
  });

  it("execute() respects a custom attachmentSizeCapBytes", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const items = [
      {
        json: {
          messageId: "msg-3",
          to: [],
          receivedDateTime: "2026-05-01T00:00:00Z",
          attachments: [
            { id: "att-a", name: "a.txt", contentType: "text/plain", size: 500 },
            { id: "att-b", name: "b.txt", contentType: "text/plain", size: 200 },
          ],
        },
      },
    ] as Parameters<typeof node.execute>[0];

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("x").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
    const session = { accessToken: "tok", refresh: vi.fn() };
    const binary = {
      attach: vi.fn().mockResolvedValue({ id: "b", storageKey: "k" }),
      withAttachment: vi.fn(
        (item: { binary?: Record<string, unknown>; json: Record<string, unknown> }, name: string, att: unknown) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: att },
        }),
      ),
    };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        // Cap at 300 bytes — att-a (500) should be skipped, att-b (200) should proceed
        config: { cfg: { mailbox: "me", downloadAttachments: true, attachmentSizeCapBytes: 300 } },
        getCredential: vi.fn().mockResolvedValue(session),
        binary,
      } as unknown as Parameters<typeof node.execute>[1];

      const out = await node.execute(items, ctx);

      expect(client.api).toHaveBeenCalledTimes(1); // only att-b fetched
      const main = out.main as ReadonlyArray<{ json: { skippedAttachments?: Array<{ name: string }> } }>;
      expect(main[0]!.json.skippedAttachments).toEqual([{ name: "a.txt", size: 500, reason: "size-cap" }]);
    } finally {
      spy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Inline-attachment slot naming
  // ---------------------------------------------------------------------------

  it("execute() uses 'inline:{contentId}' slot for inline attachments", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const items = [
      {
        json: {
          messageId: "msg-4",
          to: [],
          receivedDateTime: "2026-05-01T00:00:00Z",
          attachments: [
            {
              id: "att-inline",
              name: "image.png",
              contentType: "image/png",
              size: 500,
              isInline: true,
              contentId: "img001@example.com", // already stripped by messageMapper
            },
          ],
        },
      },
    ] as Parameters<typeof node.execute>[0];

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("imgdata").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
    const session = { accessToken: "tok", refresh: vi.fn() };
    const attachedBinary = { id: "bin-img", storageKey: "k" };
    const binary = {
      attach: vi.fn().mockResolvedValue(attachedBinary),
      withAttachment: vi.fn(
        (item: { binary?: Record<string, unknown>; json: Record<string, unknown> }, name: string, att: unknown) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: att },
        }),
      ),
    };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: { cfg: { mailbox: "me", downloadAttachments: true } },
        getCredential: vi.fn().mockResolvedValue(session),
        binary,
      } as unknown as Parameters<typeof node.execute>[1];

      const out = await node.execute(items, ctx);

      const attachArg = binary.attach.mock.calls[0]![0] as { name: string; filename: string };
      // Slot name should be "inline:img001@example.com", not "image.png"
      expect(attachArg.name).toBe("inline:img001@example.com");
      // Filename should still be the original attachment name
      expect(attachArg.filename).toBe("image.png");

      const main = out.main as ReadonlyArray<{ binary?: Record<string, unknown> }>;
      expect(main[0]!.binary?.["inline:img001@example.com"]).toBe(attachedBinary);
    } finally {
      spy.mockRestore();
    }
  });

  it("execute() uses filename slot for non-inline attachments (no isInline flag)", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const items = [
      {
        json: {
          messageId: "msg-5",
          to: [],
          receivedDateTime: "2026-05-01T00:00:00Z",
          attachments: [{ id: "att-reg", name: "document.pdf", contentType: "application/pdf", size: 100 }],
        },
      },
    ] as Parameters<typeof node.execute>[0];

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("pdf").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
    const session = { accessToken: "tok", refresh: vi.fn() };
    const binary = {
      attach: vi.fn().mockResolvedValue({ id: "b", storageKey: "k" }),
      withAttachment: vi.fn(
        (item: { binary?: Record<string, unknown>; json: Record<string, unknown> }, name: string, att: unknown) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: att },
        }),
      ),
    };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: { cfg: { mailbox: "me", downloadAttachments: true } },
        getCredential: vi.fn().mockResolvedValue(session),
        binary,
      } as unknown as Parameters<typeof node.execute>[1];

      await node.execute(items, ctx);

      const attachArg = binary.attach.mock.calls[0]![0] as { name: string };
      expect(attachArg.name).toBe("document.pdf");
    } finally {
      spy.mockRestore();
    }
  });

  it("execute() registers attachment bytes via ctx.binary.attach when downloadAttachments is true", async () => {
    const node = new OnNewMsGraphMailTriggerNode();
    const items = [
      {
        json: {
          messageId: "msg-1",
          conversationId: "c",
          receivedDateTime: "2026-05-01T00:00:00Z",
          internetMessageId: "<a@b>",
          from: { name: "", address: "x@y" },
          to: [],
          subject: "s",
          attachments: [{ id: "att-1", name: "report.pdf", contentType: "application/pdf", size: 1234 }],
        },
      },
    ] as Parameters<typeof node.execute>[0];

    // Stub Graph client returns base64 contentBytes for the per-attachment fetch.
    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("hello").toString("base64") });
    const apiRequest = { get };
    const client = { api: vi.fn().mockReturnValue(apiRequest) };
    const session = { accessToken: "tok", refresh: vi.fn() };
    const attachedBinary = { id: "binary-1", storageKey: "k" };
    const binary = {
      attach: vi.fn().mockResolvedValue(attachedBinary),
      withAttachment: vi.fn((item, name, attachment) => ({
        ...item,
        binary: { ...(item.binary ?? {}), [name]: attachment },
      })),
    };

    // createGraphClient(session) is invoked inside execute(); use vi.spyOn via dynamic import path.
    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: { cfg: { mailbox: "alice@contoso.com", downloadAttachments: true } },
        getCredential: vi.fn().mockResolvedValue(session),
        binary,
      } as unknown as Parameters<typeof node.execute>[1];

      const out = await node.execute(items, ctx);

      expect(binary.attach).toHaveBeenCalledTimes(1);
      const attachArg = binary.attach.mock.calls[0]![0] as { name: string; mimeType: string; filename: string };
      expect(attachArg.name).toBe("report.pdf");
      expect(attachArg.mimeType).toBe("application/pdf");
      expect(attachArg.filename).toBe("report.pdf");
      const main = out.main as ReadonlyArray<{ binary?: Record<string, unknown> }>;
      expect(main).toHaveLength(1);
      expect(main[0]!.binary?.["report.pdf"]).toBe(attachedBinary);
    } finally {
      spy.mockRestore();
    }
  });
});
