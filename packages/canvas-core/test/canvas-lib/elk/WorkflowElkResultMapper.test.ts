import { describe, expect, it } from "vitest";

import type { WorkflowDto } from "@codemation/host/dto";
import { WorkflowElkResultMapper } from "../../../src/canvas-lib/elk/WorkflowElkResultMapper";
import type { WorkflowElkMapperInput } from "../../../src/canvas-lib/elk/WorkflowElkResultMapper";
import type { WorkflowPositionedLayout } from "../../../src/canvas-lib/elk/WorkflowPositionedLayout.types";
import type { NodeExecutionSnapshot } from "../../../src/realtime/realtimeDomainTypes";

const noop = (): void => {};

function makeWorkflow(): WorkflowDto {
  return {
    id: "wf-1",
    name: "test",
    active: true,
    nodes: [{ id: "hitl", kind: "node", name: "Approval", type: "inboxApproval" }],
    edges: [],
  } as unknown as WorkflowDto;
}

function makePositionedLayout(workflow: WorkflowDto): WorkflowPositionedLayout {
  return {
    workflow,
    positionsByNodeId: new Map([["hitl", { x: 0, y: 0 }]]),
    sizingByNodeId: new Map([["hitl", { widthPx: 80, heightPx: 80 }]]),
    portInfoByNodeId: new Map([["hitl", { sourceOutputPorts: ["main"], targetInputPorts: ["in"] }]]),
  } as unknown as WorkflowPositionedLayout;
}

function makeInput(overrides: Partial<WorkflowElkMapperInput> = {}): WorkflowElkMapperInput {
  const workflow = makeWorkflow();
  return {
    positionedLayout: makePositionedLayout(workflow),
    nodeSnapshotsByNodeId: {},
    connectionInvocations: [],
    nodeStatusesByNodeId: { hitl: "running" } as Record<string, NodeExecutionSnapshot["status"] | undefined>,
    credentialAttentionTooltipByNodeId: new Map<string, string>(),
    selectedNodeId: null,
    propertiesTargetNodeId: null,
    pinnedNodeIds: new Set<string>(),
    isLiveWorkflowView: false,
    isRunning: false,
    workflowNodeIdsWithBoundCredential: new Set<string>(),
    onSelectNode: noop,
    onOpenPropertiesNode: noop,
    onRequestOpenCredentialEditForNode: noop,
    onRunNode: noop,
    onTogglePinnedOutput: noop,
    onEditNodeOutput: noop,
    onClearPinnedOutput: noop,
    ...overrides,
  };
}

describe("WorkflowElkResultMapper.toReactFlow — isWaitingForApproval", () => {
  it("marks a node waiting when run is suspended and the node's displayed status is running", () => {
    const { nodes } = WorkflowElkResultMapper.toReactFlow(
      makeInput({ runStatus: "suspended", nodeStatusesByNodeId: { hitl: "running" } }),
    );
    expect(nodes[0]?.data.isWaitingForApproval).toBe(true);
  });

  it("does NOT mark waiting when the run is completed even if the node status is running", () => {
    const { nodes } = WorkflowElkResultMapper.toReactFlow(
      makeInput({ runStatus: "completed", nodeStatusesByNodeId: { hitl: "running" } }),
    );
    expect(nodes[0]?.data.isWaitingForApproval).toBe(false);
  });

  it("does NOT mark waiting when the run is suspended but the node is not running", () => {
    const { nodes } = WorkflowElkResultMapper.toReactFlow(
      makeInput({ runStatus: "suspended", nodeStatusesByNodeId: { hitl: "completed" } }),
    );
    expect(nodes[0]?.data.isWaitingForApproval).toBe(false);
  });

  it("does NOT mark waiting when no runStatus is supplied (e.g. live layout path)", () => {
    const { nodes } = WorkflowElkResultMapper.toReactFlow(
      makeInput({ runStatus: undefined, nodeStatusesByNodeId: { hitl: "running" } }),
    );
    expect(nodes[0]?.data.isWaitingForApproval).toBe(false);
  });
});
