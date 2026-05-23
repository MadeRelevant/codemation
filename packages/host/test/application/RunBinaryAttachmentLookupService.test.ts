import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "@codemation/core";
import { RunBinaryAttachmentLookupService } from "../../src/application/binary/RunBinaryAttachmentLookupService";

function makeAttachment(id: string, overrides: object = {}) {
  return {
    id,
    storageKey: `storage/${id}`,
    mimeType: "image/png",
    size: 100,
    filename: `${id}.png`,
    previewKind: "image",
    ...overrides,
  };
}

function makeEmptyRunState(runId = "run_1"): PersistedRunState {
  return {
    runId,
    workflowId: "wf_1",
    status: "completed",
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    mutableState: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as PersistedRunState;
}

class WorkflowRunRepositoryStub {
  constructor(private readonly state: PersistedRunState | null) {}
  async load(_runId: string): Promise<PersistedRunState | null> {
    return this.state;
  }
  async save(_state: PersistedRunState): Promise<void> {}
}

class WorkflowDebuggerOverlayRepositoryStub {
  constructor(private readonly overlay: { currentState: unknown } | null) {}
  async load(_workflowId: string): Promise<{ currentState: unknown } | null> {
    return this.overlay;
  }
}

function makeService(
  state: PersistedRunState | null,
  overlay: { currentState: unknown } | null = null,
): RunBinaryAttachmentLookupService {
  return new RunBinaryAttachmentLookupService(
    new WorkflowRunRepositoryStub(state) as never,
    new WorkflowDebuggerOverlayRepositoryStub(overlay) as never,
  );
}

describe("RunBinaryAttachmentLookupService.findForRun", () => {
  it("returns undefined when run state is not found", async () => {
    const svc = makeService(null);
    const result = await svc.findForRun("run_missing", "bin_1");
    expect(result).toBeUndefined();
  });

  it("returns undefined when binary id not found in empty state", async () => {
    const svc = makeService(makeEmptyRunState());
    const result = await svc.findForRun("run_1", "bin_1");
    expect(result).toBeUndefined();
  });

  it("finds attachment in outputsByNode", async () => {
    const attachment = makeAttachment("bin_1");
    const state = {
      ...makeEmptyRunState(),
      outputsByNode: {
        node1: { main: [{ json: {}, binary: { f: attachment } }] },
      },
    } as unknown as PersistedRunState;
    const svc = makeService(state);
    const result = await svc.findForRun("run_1", "bin_1");
    expect(result).toMatchObject({ id: "bin_1" });
  });

  it("finds attachment in node snapshot inputsByPort", async () => {
    const attachment = makeAttachment("bin_snap_in");
    const state = {
      ...makeEmptyRunState(),
      nodeSnapshotsByNodeId: {
        node1: {
          inputsByPort: { main: [{ json: {}, binary: { f: attachment } }] },
          outputs: {},
        },
      },
    } as unknown as PersistedRunState;
    const svc = makeService(state);
    const result = await svc.findForRun("run_1", "bin_snap_in");
    expect(result).toMatchObject({ id: "bin_snap_in" });
  });

  it("finds attachment in node snapshot outputs", async () => {
    const attachment = makeAttachment("bin_snap_out");
    const state = {
      ...makeEmptyRunState(),
      nodeSnapshotsByNodeId: {
        node1: {
          inputsByPort: {},
          outputs: { main: [{ json: {}, binary: { f: attachment } }] },
        },
      },
    } as unknown as PersistedRunState;
    const svc = makeService(state);
    const result = await svc.findForRun("run_1", "bin_snap_out");
    expect(result).toMatchObject({ id: "bin_snap_out" });
  });

  it("finds attachment in mutableState pinnedOutputsByPort", async () => {
    const attachment = makeAttachment("bin_pinned");
    const state = {
      ...makeEmptyRunState(),
      mutableState: {
        nodesById: {
          node1: {
            pinnedOutputsByPort: { main: [{ json: {}, binary: { f: attachment } }] },
            lastDebugInput: undefined,
          },
        },
      },
    } as unknown as PersistedRunState;
    const svc = makeService(state);
    const result = await svc.findForRun("run_1", "bin_pinned");
    expect(result).toMatchObject({ id: "bin_pinned" });
  });

  it("finds attachment in mutableState lastDebugInput", async () => {
    const attachment = makeAttachment("bin_debug");
    const state = {
      ...makeEmptyRunState(),
      mutableState: {
        nodesById: {
          node1: {
            pinnedOutputsByPort: {},
            lastDebugInput: [{ json: {}, binary: { f: attachment } }],
          },
        },
      },
    } as unknown as PersistedRunState;
    const svc = makeService(state);
    const result = await svc.findForRun("run_1", "bin_debug");
    expect(result).toMatchObject({ id: "bin_debug" });
  });
});

describe("RunBinaryAttachmentLookupService.findForWorkflowOverlay", () => {
  it("returns undefined when overlay is not found", async () => {
    const svc = makeService(null, null);
    const result = await svc.findForWorkflowOverlay("wf_1", "bin_1");
    expect(result).toBeUndefined();
  });

  it("finds attachment in overlay outputsByNode", async () => {
    const attachment = makeAttachment("bin_overlay");
    const overlay = {
      currentState: {
        outputsByNode: { node1: { main: [{ json: {}, binary: { f: attachment } }] } },
        nodeSnapshotsByNodeId: {},
        mutableState: undefined,
      },
    };
    const svc = makeService(null, overlay);
    const result = await svc.findForWorkflowOverlay("wf_1", "bin_overlay");
    expect(result).toMatchObject({ id: "bin_overlay" });
  });

  it("finds attachment in overlay node snapshots", async () => {
    const attachment = makeAttachment("bin_overlay_snap");
    const overlay = {
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {
          node1: {
            inputsByPort: {},
            outputs: { main: [{ json: {}, binary: { f: attachment } }] },
          },
        },
        mutableState: undefined,
      },
    };
    const svc = makeService(null, overlay);
    const result = await svc.findForWorkflowOverlay("wf_1", "bin_overlay_snap");
    expect(result).toMatchObject({ id: "bin_overlay_snap" });
  });

  it("finds attachment in overlay mutableState", async () => {
    const attachment = makeAttachment("bin_overlay_mutable");
    const overlay = {
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {
            node1: {
              pinnedOutputsByPort: { main: [{ json: {}, binary: { f: attachment } }] },
              lastDebugInput: undefined,
            },
          },
        },
      },
    };
    const svc = makeService(null, overlay);
    const result = await svc.findForWorkflowOverlay("wf_1", "bin_overlay_mutable");
    expect(result).toMatchObject({ id: "bin_overlay_mutable" });
  });
});
