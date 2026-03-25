import type { BinaryAttachment } from "@codemation/core/browser";
import { describe, expect, it } from "vitest";
import { WorkflowDetailPresenter } from "../src/features/workflows/lib/workflowDetail/WorkflowDetailPresenter";

function createTestBinaryAttachment(overrides: Partial<BinaryAttachment> = {}): BinaryAttachment {
  return {
    id: "bin-1",
    storageKey: "k",
    mimeType: "application/octet-stream",
    size: 4,
    storageDriver: "local",
    previewKind: "download",
    createdAt: "2026-01-01T00:00:00.000Z",
    runId: "run-1",
    workflowId: "wf-1",
    nodeId: "node-1",
    activationId: "act-1",
    ...overrides,
  };
}

describe("WorkflowDetailPresenter pin-output binary merge", () => {
  it("extracts binary maps from items and merges JSON edits with preserved binaries by index", () => {
    const binary = createTestBinaryAttachment({ id: "keep-me" });
    const maps = WorkflowDetailPresenter.extractBinaryMapsFromItems([
      { json: { a: 1 }, binary: { file: binary } },
      { json: { b: 2 } },
    ]);
    expect(maps).toHaveLength(2);
    expect(maps[0]?.file?.id).toBe("keep-me");

    const merged = WorkflowDetailPresenter.mergePinOutputJsonWithBinaryMaps(
      JSON.stringify([{ c: 3 }, { d: 4 }, { e: 5 }]),
      WorkflowDetailPresenter.reindexBinaryMapsForItemCount(maps, 3),
    );
    expect(merged).toHaveLength(3);
    expect(merged[0]?.json).toEqual({ c: 3 });
    expect(merged[0]?.binary?.file?.id).toBe("keep-me");
    expect(merged[1]?.binary).toEqual({});
    expect(merged[2]?.binary).toEqual({});
  });

  it("reindexes binary maps when item count shrinks or grows", () => {
    const b0 = createTestBinaryAttachment({ id: "i0" });
    const b1 = createTestBinaryAttachment({ id: "i1" });
    const maps = [{ file: b0 }, { file: b1 }];
    const shrunk = WorkflowDetailPresenter.reindexBinaryMapsForItemCount(maps, 1);
    expect(shrunk).toHaveLength(1);
    expect(shrunk[0]?.file?.id).toBe("i0");

    const grown = WorkflowDetailPresenter.reindexBinaryMapsForItemCount(maps, 3);
    expect(grown).toHaveLength(3);
    expect(Object.keys(grown[2] ?? {}).length).toBe(0);
  });

  it("resolves binary content URLs for live vs historical context", () => {
    const att = createTestBinaryAttachment({ id: "x", runId: "run-1" });
    expect(WorkflowDetailPresenter.resolveBinaryContentUrl("wf-1", "live-workflow", att)).toBe(
      "/api/workflows/wf-1/debugger-overlay/binary/x/content",
    );
    expect(WorkflowDetailPresenter.resolveBinaryContentUrl("wf-1", "historical-run", att)).toBe(
      "/api/runs/run-1/binary/x/content",
    );
  });

  it("builds attachment models with overlay URLs for live workflow and run URLs for historical runs", () => {
    const att = createTestBinaryAttachment({ id: "b1", runId: "run-9" });
    const items = [{ json: { n: 1 }, binary: { f: att } }];
    const live = WorkflowDetailPresenter.toAttachmentModels(items, "wf-1", "live-workflow");
    expect(live).toHaveLength(1);
    expect(live[0]?.contentUrl).toBe("/api/workflows/wf-1/debugger-overlay/binary/b1/content");
    const historical = WorkflowDetailPresenter.toAttachmentModels(items, "wf-1", "historical-run");
    expect(historical[0]?.contentUrl).toBe("/api/runs/run-9/binary/b1/content");
  });

  it("returns empty attachment models for undefined items", () => {
    expect(WorkflowDetailPresenter.toAttachmentModels(undefined, "wf", "live-workflow")).toEqual([]);
  });
});

describe("WorkflowDetailPresenter pin-output editor JSON", () => {
  it("toPinOutputEditorJson always uses a top-level array (never single-object collapse)", () => {
    expect(JSON.parse(WorkflowDetailPresenter.toPinOutputEditorJson(undefined))).toEqual([{}]);
    expect(JSON.parse(WorkflowDetailPresenter.toPinOutputEditorJson([]))).toEqual([]);
    expect(JSON.parse(WorkflowDetailPresenter.toPinOutputEditorJson([{ json: { only: true } }]))).toEqual([
      { only: true },
    ]);
    expect(JSON.parse(WorkflowDetailPresenter.toPinOutputEditorJson([{ json: { a: 1 } }, { json: { b: 2 } }]))).toEqual(
      [{ a: 1 }, { b: 2 }],
    );
  });

  it("formatPinOutputJsonForSubmit wraps a single object as a one-element array", () => {
    expect(JSON.parse(WorkflowDetailPresenter.formatPinOutputJsonForSubmit(`{"x":1}`))).toEqual([{ x: 1 }]);
    expect(JSON.parse(WorkflowDetailPresenter.formatPinOutputJsonForSubmit(`[{"x":1}]`))).toEqual([{ x: 1 }]);
    expect(JSON.parse(WorkflowDetailPresenter.formatPinOutputJsonForSubmit(`null`))).toEqual([]);
  });
});
