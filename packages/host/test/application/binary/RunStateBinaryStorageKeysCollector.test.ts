import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "@codemation/core";
import { RunStateBinaryStorageKeysCollector } from "../../../src/application/binary/RunStateBinaryStorageKeysCollector";

const collector = new RunStateBinaryStorageKeysCollector();

function makeEmptyRunState(): PersistedRunState {
  return {
    runId: "run_1",
    workflowId: "wf_1",
    status: "completed",
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    mutableState: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as PersistedRunState;
}

function makeAttachment(storageKey: string) {
  return {
    id: "bin_1",
    storageKey,
    mimeType: "image/png",
    size: 100,
    filename: "test.png",
    previewKind: "image" as const,
  };
}

describe("RunStateBinaryStorageKeysCollector", () => {
  it("returns an empty set for a run state with no binary attachments", () => {
    const state = makeEmptyRunState();
    const keys = collector.collectFromRunState(state);
    expect(keys.size).toBe(0);
  });

  it("collects storage keys from outputsByNode", () => {
    const state = makeEmptyRunState();
    (state as unknown as { outputsByNode: unknown }).outputsByNode = {
      node1: {
        main: [{ json: {}, binary: { file: makeAttachment("key-outputs-1") } }],
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys).toContain("key-outputs-1");
  });

  it("collects storage keys from node snapshot inputsByPort", () => {
    const state = makeEmptyRunState();
    (state as unknown as { nodeSnapshotsByNodeId: unknown }).nodeSnapshotsByNodeId = {
      node1: {
        inputsByPort: { main: [{ json: {}, binary: { img: makeAttachment("key-snapshot-input") } }] },
        outputs: {},
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys).toContain("key-snapshot-input");
  });

  it("collects storage keys from node snapshot outputs", () => {
    const state = makeEmptyRunState();
    (state as unknown as { nodeSnapshotsByNodeId: unknown }).nodeSnapshotsByNodeId = {
      node1: {
        inputsByPort: {},
        outputs: { main: [{ json: {}, binary: { img: makeAttachment("key-snapshot-output") } }] },
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys).toContain("key-snapshot-output");
  });

  it("collects storage keys from mutableState pinnedOutputsByPort", () => {
    const state = makeEmptyRunState();
    (state as unknown as { mutableState: unknown }).mutableState = {
      nodesById: {
        node1: {
          pinnedOutputsByPort: { main: [{ json: {}, binary: { file: makeAttachment("key-pinned") } }] },
          lastDebugInput: undefined,
        },
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys).toContain("key-pinned");
  });

  it("collects storage keys from mutableState lastDebugInput", () => {
    const state = makeEmptyRunState();
    (state as unknown as { mutableState: unknown }).mutableState = {
      nodesById: {
        node1: {
          pinnedOutputsByPort: {},
          lastDebugInput: [{ json: {}, binary: { upload: makeAttachment("key-debug-input") } }],
        },
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys).toContain("key-debug-input");
  });

  it("deduplicates keys referenced from multiple places", () => {
    const state = makeEmptyRunState();
    const attachment = makeAttachment("shared-key");
    (state as unknown as { outputsByNode: unknown }).outputsByNode = {
      node1: { main: [{ json: {}, binary: { f: attachment } }] },
    };
    (state as unknown as { nodeSnapshotsByNodeId: unknown }).nodeSnapshotsByNodeId = {
      node1: {
        inputsByPort: { main: [{ json: {}, binary: { f: attachment } }] },
        outputs: {},
      },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys.size).toBe(1);
    expect(keys).toContain("shared-key");
  });

  it("skips attachments with an empty storageKey", () => {
    const state = makeEmptyRunState();
    (state as unknown as { outputsByNode: unknown }).outputsByNode = {
      node1: { main: [{ json: {}, binary: { f: makeAttachment("") } }] },
    };
    const keys = collector.collectFromRunState(state);
    expect(keys.size).toBe(0);
  });

  it("handles undefined mutableState gracefully", () => {
    const state = makeEmptyRunState();
    expect(() => collector.collectFromRunState(state)).not.toThrow();
  });
});
