import { describe, expect, it } from "vitest";

import { PersistedWorkflowTokenRegistry } from "../../src/bootstrap/index.ts";
import { WorkflowSnapshotCodec } from "../../src/workflowSnapshots/WorkflowSnapshotCodec";
import type { WorkflowDefinition } from "../../src/types";

/**
 * Covers the {@link WorkflowSnapshotCodec.create} path that materialises the optional
 * `inspectorSummary()` hook into a JSON-safe peer field on the persisted snapshot, plus
 * the defensive parser that filters bad rows / handles a throwing or malformed hook.
 *
 * Why a peer field, not embedded in `config`: hydration uses `mergeValue` which copies
 * every key off the snapshot config onto the live config; embedding the rows there
 * would silently mutate the live config object's shape on every load.
 */

class TestNodeToken {}

function workflowWithNodeConfig(nodeConfig: Record<string, unknown>): WorkflowDefinition {
  return {
    id: "wf.codec.inspect",
    name: "Codec inspect test",
    nodes: [
      {
        id: "node_1",
        kind: "node",
        type: TestNodeToken,
        config: { type: TestNodeToken, kind: "node", ...nodeConfig } as never,
      },
    ],
    edges: [],
  };
}

function newCodec(): WorkflowSnapshotCodec {
  return new WorkflowSnapshotCodec(new PersistedWorkflowTokenRegistry());
}

describe("WorkflowSnapshotCodec.create — inspectorSummary materialisation", () => {
  it("populates the snapshot node's `inspectorSummary` peer field when the hook returns valid rows", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary() {
          return [
            { label: "Method", value: "POST" },
            { label: "URL", value: "https://api.example.com/x" },
          ];
        },
      }),
    );
    const node = snapshot.nodes[0];
    expect(node?.inspectorSummary).toEqual([
      { label: "Method", value: "POST" },
      { label: "URL", value: "https://api.example.com/x" },
    ]);
  });

  it("does NOT embed the rows into the serialised `config` blob (peer field only, keeps hydration clean)", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary: () => [{ label: "Schedule", value: "0 10 * * *" }],
      }),
    );
    const node = snapshot.nodes[0];
    expect(Object.prototype.hasOwnProperty.call(node?.config ?? {}, "inspectorSummary")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(node?.config ?? {}, "_inspectorSummary")).toBe(false);
  });

  it("omits the field when the hook is absent", () => {
    const snapshot = newCodec().create(workflowWithNodeConfig({}));
    const node = snapshot.nodes[0];
    expect(Object.prototype.hasOwnProperty.call(node ?? {}, "inspectorSummary")).toBe(false);
  });

  it("omits the field when the hook returns an empty array", () => {
    const snapshot = newCodec().create(workflowWithNodeConfig({ inspectorSummary: () => [] }));
    const node = snapshot.nodes[0];
    expect(Object.prototype.hasOwnProperty.call(node ?? {}, "inspectorSummary")).toBe(false);
  });

  it("omits the field when the hook throws — workflow snapshots must not break on a misbehaving node", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary() {
          throw new Error("boom");
        },
      }),
    );
    const node = snapshot.nodes[0];
    expect(Object.prototype.hasOwnProperty.call(node ?? {}, "inspectorSummary")).toBe(false);
  });

  it("omits the field when the hook returns a non-array (defensive against accidental misuse)", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary: () => ({ label: "Oops", value: "not in an array" }) as unknown as ReadonlyArray<unknown>,
      }),
    );
    const node = snapshot.nodes[0];
    expect(Object.prototype.hasOwnProperty.call(node ?? {}, "inspectorSummary")).toBe(false);
  });

  it("filters out malformed rows (missing label / non-string value / blank label / non-object entries)", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary() {
          return [
            "stringy" as unknown as { label: string; value: string },
            42 as unknown as { label: string; value: string },
            null as unknown as { label: string; value: string },
            { value: "missing label" } as { label?: string; value: string },
            { label: "Numeric value", value: 7 } as unknown as { label: string; value: string },
            { label: "  ", value: "blank label" },
            { label: "Valid", value: "ok" },
          ];
        },
      }),
    );
    const node = snapshot.nodes[0];
    expect(node?.inspectorSummary).toEqual([{ label: "Valid", value: "ok" }]);
  });

  it("trims label whitespace but preserves value as-is (multi-line system-prompt previews allowed)", () => {
    const snapshot = newCodec().create(
      workflowWithNodeConfig({
        inspectorSummary: () => [{ label: "  Prompt  ", value: "Line one\nLine two" }],
      }),
    );
    const node = snapshot.nodes[0];
    expect(node?.inspectorSummary).toEqual([{ label: "Prompt", value: "Line one\nLine two" }]);
  });
});
