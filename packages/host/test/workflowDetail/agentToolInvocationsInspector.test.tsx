// @vitest-environment jsdom

import type {
  ConnectionInvocationRecord,
  PersistedRunState,
  WorkflowDto,
  WorkflowEvent,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WorkflowDetailFixtureFactory,
  WorkflowDetailRealtimeFixtureFactory,
  WorkflowDetailScreenTestKit,
} from "./testkit";

class AgentToolInvocationsFixture {
  static readonly toolName = "lookup_tool";
  static readonly parentActivationId = "act_parent_1";

  static buildInvocation(
    args: Readonly<{
      invocationId: string;
      status: ConnectionInvocationRecord["status"];
      updatedAt: string;
      connectionNodeId?: string;
      managedInput?: ConnectionInvocationRecord["managedInput"];
      managedOutput?: ConnectionInvocationRecord["managedOutput"];
    }>,
  ): ConnectionInvocationRecord {
    return {
      invocationId: args.invocationId,
      runId: WorkflowDetailFixtureFactory.runId,
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      connectionNodeId: args.connectionNodeId ?? WorkflowDetailFixtureFactory.toolNodeId,
      parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
      parentAgentActivationId: this.parentActivationId,
      status: args.status,
      managedInput: args.managedInput ?? { query: args.invocationId },
      managedOutput:
        args.managedOutput ?? (args.status === "completed" ? { answer: `result-${args.invocationId}` } : undefined),
      updatedAt: args.updatedAt,
    };
  }

  static buildLiveRunStateWithInvocations(
    args: Readonly<{
      invocations: ReadonlyArray<ConnectionInvocationRecord>;
      runStatus?: PersistedRunState["status"];
      agentSnapshotStatus?: "running" | "completed";
    }>,
  ): PersistedRunState {
    const baseRunState = WorkflowDetailFixtureFactory.createCompletedRunState();
    const agentSnapshot =
      args.agentSnapshotStatus === "running"
        ? {
            ...baseRunState.nodeSnapshotsByNodeId![WorkflowDetailFixtureFactory.agentNodeId]!,
            status: "running" as const,
            finishedAt: undefined,
          }
        : baseRunState.nodeSnapshotsByNodeId![WorkflowDetailFixtureFactory.agentNodeId]!;
    return {
      ...baseRunState,
      status: args.runStatus ?? baseRunState.status,
      connectionInvocations: args.invocations,
      nodeSnapshotsByNodeId: {
        ...baseRunState.nodeSnapshotsByNodeId!,
        [WorkflowDetailFixtureFactory.agentNodeId]: agentSnapshot,
      },
    };
  }

  static buildRunSavedEvent(state: PersistedRunState, at = "2026-03-11T12:01:00.000Z"): WorkflowEvent {
    return {
      kind: "runSaved",
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      at,
      state,
    };
  }
}

class AgentToolInvocationsHarness {
  private constructor(private readonly kit: WorkflowDetailScreenTestKit) {}

  static async create(workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail()): Promise<{
    kit: WorkflowDetailScreenTestKit;
    harness: AgentToolInvocationsHarness;
  }> {
    const kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.render();
    await kit.waitForSocketConnection();
    await kit.waitForWorkflowSubscription();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.subscribed(workflow.id));
    await kit.waitForCanvasReady();
    await kit.startRun();
    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runCreated());
    return { kit, harness: new AgentToolInvocationsHarness(kit) };
  }

  emitRunSaved(state: PersistedRunState, at?: string): void {
    this.kit.emitJson({ kind: "event", event: AgentToolInvocationsFixture.buildRunSavedEvent(state, at) });
  }
}

class ScrollIntoViewSpy {
  private readonly calls: Array<{ element: HTMLElement; argument: unknown }> = [];
  private readonly previousDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

  install(): void {
    const calls = this.calls;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: function scrollIntoViewSpy(this: HTMLElement, argument?: boolean | ScrollIntoViewOptions): void {
        calls.push({ element: this, argument });
      },
    });
  }

  restore(): void {
    if (this.previousDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", this.previousDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  }

  callsForTestId(testId: string): ReadonlyArray<{ element: HTMLElement; argument: unknown }> {
    return this.calls.filter((entry) => entry.element.getAttribute("data-testid") === testId);
  }

  clear(): void {
    this.calls.length = 0;
  }
}

describe("agent tool invocations inspector", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;
  let scrollSpy: ScrollIntoViewSpy | null = null;

  beforeEach(() => {
    scrollSpy = new ScrollIntoViewSpy();
    scrollSpy.install();
  });

  afterEach(() => {
    kit?.dispose();
    kit = null;
    scrollSpy?.restore();
    scrollSpy = null;
  });

  it("renders one execution-tree row per tool invocation", async () => {
    const created = await AgentToolInvocationsHarness.create();
    kit = created.kit;
    const invocations = [
      AgentToolInvocationsFixture.buildInvocation({
        invocationId: "cinv_a",
        status: "completed",
        updatedAt: "2026-03-11T12:00:10.000Z",
      }),
      AgentToolInvocationsFixture.buildInvocation({
        invocationId: "cinv_b",
        status: "completed",
        updatedAt: "2026-03-11T12:00:11.000Z",
      }),
      AgentToolInvocationsFixture.buildInvocation({
        invocationId: "cinv_c",
        status: "completed",
        updatedAt: "2026-03-11T12:00:12.000Z",
      }),
      AgentToolInvocationsFixture.buildInvocation({
        invocationId: "cinv_d",
        status: "completed",
        updatedAt: "2026-03-11T12:00:13.000Z",
      }),
    ];
    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({ invocations, runStatus: "completed" }),
    );

    await waitFor(() => {
      for (const invocation of invocations) {
        expect(screen.getByTestId(`execution-tree-node-${invocation.invocationId}`)).toBeInTheDocument();
      }
    });

    await kit.selectCanvasNode(WorkflowDetailFixtureFactory.toolNodeId);
    await waitFor(() => {
      const metricsSection = screen.getByTestId("node-properties-section-tool-metrics");
      const text = metricsSection.textContent ?? "";
      expect(text).toMatch(/Invocations\s*4/);
      expect(text).toMatch(/Completed\s*4/);
    });
  });

  it("promotes a running tool invocation row to completed in place when status updates arrive", async () => {
    const created = await AgentToolInvocationsHarness.create();
    kit = created.kit;
    const invocationId = "cinv_promote";

    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({
        invocations: [
          AgentToolInvocationsFixture.buildInvocation({
            invocationId,
            status: "running",
            updatedAt: "2026-03-11T12:00:10.000Z",
          }),
        ],
        runStatus: "pending",
        agentSnapshotStatus: "running",
      }),
    );

    await waitFor(() => {
      const row = screen.getByTestId(`execution-tree-node-${invocationId}`);
      expect(row.getAttribute("data-codemation-status")).toBe("running");
    });

    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({
        invocations: [
          AgentToolInvocationsFixture.buildInvocation({
            invocationId,
            status: "completed",
            updatedAt: "2026-03-11T12:00:20.000Z",
          }),
        ],
        runStatus: "completed",
      }),
      "2026-03-11T12:01:01.000Z",
    );

    await waitFor(() => {
      const rows = screen.getAllByTestId(`execution-tree-node-${invocationId}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.getAttribute("data-codemation-status")).toBe("completed");
    });
  });

  it("preserves a user-collapsed agent branch when more tool invocations arrive", async () => {
    const created = await AgentToolInvocationsHarness.create();
    kit = created.kit;
    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({
        invocations: [
          AgentToolInvocationsFixture.buildInvocation({
            invocationId: "cinv_a",
            status: "completed",
            updatedAt: "2026-03-11T12:00:10.000Z",
          }),
        ],
        runStatus: "pending",
        agentSnapshotStatus: "running",
      }),
    );

    let agentToggle: HTMLElement;
    await waitFor(() => {
      agentToggle = screen.getByTestId(`execution-tree-toggle-${WorkflowDetailFixtureFactory.agentNodeId}`);
      expect(agentToggle.getAttribute("aria-expanded")).toBe("true");
    });
    fireEvent.click(agentToggle!);
    await waitFor(() => {
      expect(
        screen
          .getByTestId(`execution-tree-toggle-${WorkflowDetailFixtureFactory.agentNodeId}`)
          .getAttribute("aria-expanded"),
      ).toBe("false");
    });

    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({
        invocations: [
          AgentToolInvocationsFixture.buildInvocation({
            invocationId: "cinv_a",
            status: "completed",
            updatedAt: "2026-03-11T12:00:10.000Z",
          }),
          AgentToolInvocationsFixture.buildInvocation({
            invocationId: "cinv_b",
            status: "completed",
            updatedAt: "2026-03-11T12:00:20.000Z",
          }),
        ],
        runStatus: "pending",
        agentSnapshotStatus: "running",
      }),
      "2026-03-11T12:01:01.000Z",
    );

    expect(
      screen
        .getByTestId(`execution-tree-toggle-${WorkflowDetailFixtureFactory.agentNodeId}`)
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTestId("execution-tree-node-cinv_b")).toBeNull();

    fireEvent.click(screen.getByTestId(`execution-tree-toggle-${WorkflowDetailFixtureFactory.agentNodeId}`));
    await waitFor(() => {
      expect(screen.getByTestId("execution-tree-node-cinv_b")).toBeInTheDocument();
    });
  });

  it("auto-scrolls the running invocation row into view when state arrives", async () => {
    const created = await AgentToolInvocationsHarness.create();
    kit = created.kit;
    const invocationId = "cinv_autofollow";

    created.harness.emitRunSaved(
      AgentToolInvocationsFixture.buildLiveRunStateWithInvocations({
        invocations: [
          AgentToolInvocationsFixture.buildInvocation({
            invocationId,
            status: "running",
            updatedAt: "2026-03-11T12:00:10.000Z",
          }),
        ],
        runStatus: "pending",
        agentSnapshotStatus: "running",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId(`execution-tree-node-${invocationId}`)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(scrollSpy!.callsForTestId(`execution-tree-node-${invocationId}`).length).toBeGreaterThan(0);
    });
  });
});
