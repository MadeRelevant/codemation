/**
 * Tests for DefaultExecutionBinaryService and DefaultNodeBinaryAttachmentService —
 * covers forNode, openReadStream, resolvePreviewKind, and sanitize branches.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { DefaultExecutionBinaryService } from "../../src/binaries/DefaultExecutionBinaryServiceFactory";
import { DefaultNodeBinaryAttachmentService } from "../../src/binaries/DefaultNodeBinaryAttachmentServiceFactory";
import { InMemoryBinaryStorage } from "../../src/runStorage/InMemoryBinaryStorageRegistry";

function makeBinaryService() {
  const storage = new InMemoryBinaryStorage();
  const now = () => new Date("2026-01-01T00:00:00.000Z");
  const svc = new DefaultExecutionBinaryService(storage, "wf-1", "run-1", now);
  return { svc, storage };
}

describe("DefaultExecutionBinaryService", () => {
  test("forNode returns a NodeBinaryAttachmentService", () => {
    const { svc } = makeBinaryService();
    const nodeSvc = svc.forNode({ nodeId: "n1", activationId: "act-1" });
    assert.ok(nodeSvc);
    assert.equal(typeof nodeSvc.attach, "function");
  });

  test("openReadStream returns undefined for missing attachment", async () => {
    const { svc } = makeBinaryService();
    const result = await svc.openReadStream({
      id: "att-1",
      storageKey: "nonexistent",
      mimeType: "text/plain",
      size: 0,
      storageDriver: "memory",
      previewKind: "download",
      createdAt: "2026-01-01T00:00:00.000Z",
      runId: "run-1",
      workflowId: "wf-1",
      nodeId: "n1",
      activationId: "act-1",
    });
    assert.equal(result, undefined);
  });
});

describe("DefaultNodeBinaryAttachmentService", () => {
  function makeNodeService() {
    const storage = new InMemoryBinaryStorage();
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const svc = new DefaultNodeBinaryAttachmentService(storage, "wf-1", "run-1", "n1", "act-1", now);
    return { svc, storage };
  }

  test("attach stores binary body and returns attachment metadata", async () => {
    const { svc } = makeNodeService();
    const body = new Uint8Array([1, 2, 3]);
    const attachment = await svc.attach({ name: "my-file", body, mimeType: "application/octet-stream" });
    assert.ok(attachment.id);
    assert.ok(attachment.storageKey);
    assert.equal(attachment.mimeType, "application/octet-stream");
    assert.equal(attachment.runId, "run-1");
    assert.equal(attachment.workflowId, "wf-1");
    assert.equal(attachment.nodeId, "n1");
  });

  test("attach resolves previewKind=image for image/ mimeType", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({ name: "img", body: new Uint8Array([]), mimeType: "image/png" });
    assert.equal(att.previewKind, "image");
  });

  test("attach resolves previewKind=audio for audio/ mimeType", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({ name: "aud", body: new Uint8Array([]), mimeType: "audio/mp3" });
    assert.equal(att.previewKind, "audio");
  });

  test("attach resolves previewKind=video for video/ mimeType", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({ name: "vid", body: new Uint8Array([]), mimeType: "video/mp4" });
    assert.equal(att.previewKind, "video");
  });

  test("attach resolves previewKind=download for unknown mimeType", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({ name: "doc", body: new Uint8Array([]), mimeType: "application/pdf" });
    assert.equal(att.previewKind, "download");
  });

  test("attach accepts explicit previewKind override", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({
      name: "img",
      body: new Uint8Array([]),
      mimeType: "image/png",
      previewKind: "download",
    });
    assert.equal(att.previewKind, "download");
  });

  test("attach includes filename when provided", async () => {
    const { svc } = makeNodeService();
    const att = await svc.attach({
      name: "doc",
      body: new Uint8Array([]),
      mimeType: "application/pdf",
      filename: "report.pdf",
    });
    assert.ok(att.storageKey.includes("report.pdf"));
  });

  test("withAttachment adds attachment to item binary map", () => {
    const { svc } = makeNodeService();
    const item = { json: { x: 1 } };
    const attachment = {
      id: "att-1",
      storageKey: "key",
      mimeType: "text/plain",
      size: 0,
      storageDriver: "memory",
      previewKind: "download" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      runId: "run-1",
      workflowId: "wf-1",
      nodeId: "n1",
      activationId: "act-1",
    };
    const result = svc.withAttachment(item, "file", attachment);
    assert.ok(result.binary);
    assert.equal((result.binary as Record<string, unknown>).file, attachment);
  });

  test("forNode returns a new service scoped to the given nodeId/activationId", async () => {
    const { svc } = makeNodeService();
    const childSvc = svc.forNode({ nodeId: "n2", activationId: "act-2" });
    const att = await childSvc.attach({ name: "f", body: new Uint8Array([42]), mimeType: "text/plain" });
    assert.equal(att.nodeId, "n2");
    assert.equal(att.activationId, "act-2");
  });
});
