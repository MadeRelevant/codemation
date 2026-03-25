// @vitest-environment node

import { InMemoryBinaryStorage } from "@codemation/core";
import { describe, expect, it } from "vitest";
import {
  OVERLAY_PIN_BINARY_RUN_ID,
  OverlayPinnedBinaryUploadService,
} from "../../src/application/binary/OverlayPinnedBinaryUploadService";

describe("OverlayPinnedBinaryUploadService", () => {
  it("stores bytes and returns attachment metadata scoped to overlay-pin run id", async () => {
    const storage = new InMemoryBinaryStorage();
    const service = new OverlayPinnedBinaryUploadService(storage);
    const body = new TextEncoder().encode("hello-overlay");

    const attachment = await service.attach({
      workflowId: "wf_test",
      nodeId: "node_test",
      itemIndex: 2,
      name: "doc",
      mimeType: "text/plain",
      filename: "notes.txt",
      body,
    });

    expect(attachment.runId).toBe(OVERLAY_PIN_BINARY_RUN_ID);
    expect(attachment.workflowId).toBe("wf_test");
    expect(attachment.nodeId).toBe("node_test");
    expect(attachment.activationId).toBe("overlay-pin-i2");
    expect(attachment.mimeType).toBe("text/plain");
    expect(attachment.storageKey).toContain("wf_test");
    expect(attachment.storageKey).toContain("overlay-pin");
    expect(attachment.storageKey).toContain("node_test");

    const read = await storage.openReadStream(attachment.storageKey);
    expect(read).toBeDefined();
    expect(read?.size).toBe(body.length);
  });

  it("infers image preview kind from mime type", async () => {
    const storage = new InMemoryBinaryStorage();
    const service = new OverlayPinnedBinaryUploadService(storage);
    const attachment = await service.attach({
      workflowId: "wf",
      nodeId: "n",
      itemIndex: 0,
      name: "img",
      mimeType: "image/png",
      body: new Uint8Array([137, 80, 78, 71]),
    });
    expect(attachment.previewKind).toBe("image");
  });
});
