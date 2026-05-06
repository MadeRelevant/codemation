import { describe, expect, it, vi } from "vitest";
import { runCycle, attachAttachmentBinaries } from "../src/mail/onNewMailNode";
import { onNewMsGraphMailTrigger } from "../src/mail/onNewMailNode";
import type { GraphApiRequest, GraphClient } from "../src/mail/onNewMailNode";
import type { MsGraphMailItem } from "../src/mail/types";
import type { Item } from "@codemation/core";

describe("onNewMsGraphMailTrigger", () => {
  it("poll() resolves credential and returns polling state (baseline cycle)", async () => {
    const request: GraphApiRequest = {
      top: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ value: [{ id: "msg-1" }] }),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(request) };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const result = await onNewMsGraphMailTrigger.poll({
        config: { mailbox: "alice@contoso.com" } as never,
        state: undefined,
        credentials: {
          auth: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        } as never,
      });

      // First poll (no prior state) → baseline, no items
      expect(result.items).toHaveLength(0);
      expect(result.nextState).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("poll() emits new messages after baseline is complete", async () => {
    const request: GraphApiRequest = {
      top: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        value: [
          {
            id: "msg-2",
            receivedDateTime: "2026-05-01T00:00:00Z",
            body: { contentType: "text", content: "" },
            toRecipients: [],
          },
        ],
      }),
    };
    const client: GraphClient = { api: vi.fn().mockReturnValue(request) };

    const mod = await import("../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      // Pass a state that is already past baseline, with no previously seen message
      const result = await onNewMsGraphMailTrigger.poll({
        config: { mailbox: "me" } as never,
        state: {
          mailbox: "me",
          folderId: "inbox",
          processedMessageIds: [],
          baselineComplete: true,
        } as never,
        credentials: {
          auth: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        } as never,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.json).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("onNewMsGraphMailTrigger.create() returns a TriggerNodeConfig with correct credential requirements", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "me" } as never);
    const creds = config.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});

describe("runCycle — filter behavior", () => {
  it("applies 'isRead eq false' filter by default when cfg.filter is undefined", async () => {
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
});

describe("attachAttachmentBinaries", () => {
  it("skips oversized attachments and emits skippedAttachments[] on the item", async () => {
    const NORMAL_SIZE = 100;
    const OVERSIZED = 50_000_000; // 50 MiB > default 25 MiB cap
    const item: Item<MsGraphMailItem> = {
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
      } as MsGraphMailItem,
    };

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("data").toString("base64") });
    const apiRequest = { get };
    const client = { api: vi.fn().mockReturnValue(apiRequest) };
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

    const result = await attachAttachmentBinaries(
      item,
      client as never,
      { mailbox: "me", downloadAttachments: true },
      binary as never,
    );

    expect(client.api).toHaveBeenCalledTimes(1); // only small attachment fetched
    expect(binary.attach).toHaveBeenCalledTimes(1);
    expect(
      (result.json as { skippedAttachments?: Array<{ name: string; size: number; reason: string }> })
        .skippedAttachments,
    ).toEqual([{ name: "huge.zip", size: OVERSIZED, reason: "size-cap" }]);
  });

  it("respects a custom attachmentSizeCapBytes", async () => {
    const item: Item<MsGraphMailItem> = {
      json: {
        messageId: "msg-3",
        to: [],
        receivedDateTime: "2026-05-01T00:00:00Z",
        attachments: [
          { id: "att-a", name: "a.txt", contentType: "text/plain", size: 500 },
          { id: "att-b", name: "b.txt", contentType: "text/plain", size: 200 },
        ],
      } as MsGraphMailItem,
    };

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("x").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
    const binary = {
      attach: vi.fn().mockResolvedValue({ id: "b", storageKey: "k" }),
      withAttachment: vi.fn(
        (item: { binary?: Record<string, unknown>; json: Record<string, unknown> }, name: string, att: unknown) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: att },
        }),
      ),
    };

    // Cap at 300 bytes — att-a (500) should be skipped, att-b (200) should proceed
    const result = await attachAttachmentBinaries(
      item,
      client as never,
      { mailbox: "me", downloadAttachments: true, attachmentSizeCapBytes: 300 },
      binary as never,
    );

    expect(client.api).toHaveBeenCalledTimes(1); // only att-b fetched
    expect((result.json as { skippedAttachments?: Array<{ name: string }> }).skippedAttachments).toEqual([
      { name: "a.txt", size: 500, reason: "size-cap" },
    ]);
  });

  it("uses 'inline:{contentId}' slot for inline attachments", async () => {
    const item: Item<MsGraphMailItem> = {
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
            contentId: "img001@example.com",
          },
        ],
      } as MsGraphMailItem,
    };

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("imgdata").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
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

    const result = await attachAttachmentBinaries(
      item,
      client as never,
      { mailbox: "me", downloadAttachments: true },
      binary as never,
    );

    const attachArg = binary.attach.mock.calls[0]![0] as { name: string; filename: string };
    expect(attachArg.name).toBe("inline:img001@example.com");
    expect(attachArg.filename).toBe("image.png");
    expect((result as { binary?: Record<string, unknown> }).binary?.["inline:img001@example.com"]).toBe(attachedBinary);
  });

  it("uses filename slot for non-inline attachments", async () => {
    const item: Item<MsGraphMailItem> = {
      json: {
        messageId: "msg-5",
        to: [],
        receivedDateTime: "2026-05-01T00:00:00Z",
        attachments: [{ id: "att-reg", name: "document.pdf", contentType: "application/pdf", size: 100 }],
      } as MsGraphMailItem,
    };

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("pdf").toString("base64") });
    const client = { api: vi.fn().mockReturnValue({ get }) };
    const binary = {
      attach: vi.fn().mockResolvedValue({ id: "b", storageKey: "k" }),
      withAttachment: vi.fn(
        (item: { binary?: Record<string, unknown>; json: Record<string, unknown> }, name: string, att: unknown) => ({
          ...item,
          binary: { ...(item.binary ?? {}), [name]: att },
        }),
      ),
    };

    await attachAttachmentBinaries(
      item,
      client as never,
      { mailbox: "me", downloadAttachments: true },
      binary as never,
    );

    const attachArg = binary.attach.mock.calls[0]![0] as { name: string };
    expect(attachArg.name).toBe("document.pdf");
  });

  it("registers attachment bytes via binary.attach when downloadAttachments is true", async () => {
    const item: Item<MsGraphMailItem> = {
      json: {
        messageId: "msg-1",
        conversationId: "c",
        receivedDateTime: "2026-05-01T00:00:00Z",
        internetMessageId: "<a@b>",
        to: [],
        subject: "s",
        attachments: [{ id: "att-1", name: "report.pdf", contentType: "application/pdf", size: 1234 }],
      } as MsGraphMailItem,
    };

    const get = vi.fn().mockResolvedValue({ contentBytes: Buffer.from("hello").toString("base64") });
    const apiRequest = { get };
    const client = { api: vi.fn().mockReturnValue(apiRequest) };
    const attachedBinary = { id: "binary-1", storageKey: "k" };
    const binary = {
      attach: vi.fn().mockResolvedValue(attachedBinary),
      withAttachment: vi.fn((item: unknown, name: string, attachment: unknown) => ({
        ...(item as Record<string, unknown>),
        binary: { ...((item as { binary?: Record<string, unknown> }).binary ?? {}), [name]: attachment },
      })),
    };

    const result = await attachAttachmentBinaries(
      item,
      client as never,
      { mailbox: "alice@contoso.com", downloadAttachments: true },
      binary as never,
    );

    expect(binary.attach).toHaveBeenCalledTimes(1);
    const attachArg = binary.attach.mock.calls[0]![0] as { name: string; mimeType: string; filename: string };
    expect(attachArg.name).toBe("report.pdf");
    expect(attachArg.mimeType).toBe("application/pdf");
    expect(attachArg.filename).toBe("report.pdf");
    expect((result as { binary?: Record<string, unknown> }).binary?.["report.pdf"]).toBe(attachedBinary);
  });
});
