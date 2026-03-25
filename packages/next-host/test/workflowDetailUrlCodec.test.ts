import { describe, expect, it } from "vitest";
import { WorkflowDetailUrlCodec } from "../src/features/workflows/lib/workflowDetail/WorkflowDetailUrlCodec";

describe("WorkflowDetailUrlCodec", () => {
  it("parses empty params as live canvas without sidebar", () => {
    const sp = new URLSearchParams("");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
  });

  it("parses run and implies executions pane when run is set", () => {
    const sp = new URLSearchParams("run=r1");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: "r1",
      isRunsPaneVisible: true,
      nodeId: null,
    });
  });

  it("parses pane=executions without run as list-only live view", () => {
    const sp = new URLSearchParams("pane=executions");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: null,
      isRunsPaneVisible: true,
      nodeId: null,
    });
  });

  it("parses pane=live as sidebar hidden", () => {
    const sp = new URLSearchParams("pane=live");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
  });

  it("ignores unknown pane values", () => {
    const sp = new URLSearchParams("pane=other");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
  });

  it("parses node param", () => {
    const sp = new URLSearchParams("run=r1&node=n1");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: "r1",
      isRunsPaneVisible: true,
      nodeId: "n1",
    });
  });

  it("trims run and node whitespace", () => {
    const sp = new URLSearchParams("run=%20r1%20&node=%20");
    expect(WorkflowDetailUrlCodec.parseSearchParams(sp)).toEqual({
      selectedRunId: "r1",
      isRunsPaneVisible: true,
      nodeId: null,
    });
  });

  it("merges location while preserving unrelated keys", () => {
    const base = new URLSearchParams("foo=bar&run=old");
    const merged = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(base, {
      selectedRunId: "r2",
      isRunsPaneVisible: true,
      nodeId: "n1",
    });
    expect(merged.get("foo")).toBe("bar");
    expect(merged.get("run")).toBe("r2");
    expect(merged.get("node")).toBe("n1");
    expect(merged.has("pane")).toBe(false);
  });

  it("buildHref omits query when location is default", () => {
    const href = WorkflowDetailUrlCodec.buildHref("/workflows/w1", new URLSearchParams("x=1"), {
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
    expect(href).toBe("/workflows/w1?x=1");
  });

  it("round-trips run pane and node through merge", () => {
    const base = new URLSearchParams("");
    const loc = WorkflowDetailUrlCodec.parseSearchParams(
      new URLSearchParams(
        WorkflowDetailUrlCodec.toQueryString(
          WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(base, {
            selectedRunId: "r1",
            isRunsPaneVisible: true,
            nodeId: "n1",
          }),
        ),
      ),
    );
    expect(loc).toEqual({
      selectedRunId: "r1",
      isRunsPaneVisible: true,
      nodeId: "n1",
    });
  });
});
