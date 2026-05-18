import { type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";

import type { WorkflowDto } from "@codemation/host/dto";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../realtime/realtimeDomainTypes";
import type { WorkflowCanvasConfig } from "../types/WorkflowCanvasConfig";
import { ElkLayoutRunner } from "./elk/ElkLayoutRunner";
import { WorkflowElkGraphBuilder } from "./elk/WorkflowElkGraphBuilder";
import { WorkflowElkNodeSizingResolver } from "./elk/WorkflowElkNodeSizingResolver";
import { WorkflowElkPortInfoResolver } from "./elk/WorkflowElkPortInfoResolver";
import { WorkflowElkResultMapper } from "./elk/WorkflowElkResultMapper";
import type { WorkflowCanvasNodeData } from "./workflowCanvasNodeData";

/**
 * Computes positions for every workflow node using the ELK Layered algorithm
 * (with compound-graph support for AI-agent attachment stacks) and maps the
 * positioned graph to React Flow nodes/edges with every piece of runtime data
 * the canvas UI needs (snapshots, selection, pinned output, per-edge item
 * counts, etc.).
 *
 * Async because `elkjs.layout` returns a Promise.
 */
export async function layoutWorkflow(
  workflow: WorkflowDto,
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>,
  credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>,
  selectedNodeId: string | null,
  propertiesTargetNodeId: string | null,
  pinnedNodeIds: ReadonlySet<string>,
  isLiveWorkflowView: boolean,
  isRunning: boolean,
  workflowNodeIdsWithBoundCredential: ReadonlySet<string>,
  onSelectNode: (nodeId: string) => void,
  onOpenPropertiesNode: (nodeId: string) => void,
  onRequestOpenCredentialEditForNode: (nodeId: string) => void,
  onRunNode: (nodeId: string) => void,
  onTogglePinnedOutput: (nodeId: string) => void,
  onEditNodeOutput: (nodeId: string) => void,
  onClearPinnedOutput: (nodeId: string) => void,
  config?: WorkflowCanvasConfig,
): Promise<Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }>> {
  const filteredNodes = config?.nodeRoleFilter
    ? workflow.nodes.filter((n) => config.nodeRoleFilter!(n.role ?? "main", n.type))
    : workflow.nodes;
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = workflow.edges.filter(
    (e) => filteredNodeIds.has(e.from.nodeId) && filteredNodeIds.has(e.to.nodeId),
  );
  const workflowToLayout = config?.nodeRoleFilter
    ? { ...workflow, nodes: filteredNodes, edges: filteredEdges }
    : workflow;

  const portInfoByNodeId = WorkflowElkPortInfoResolver.resolve(workflowToLayout);
  const sizingByNodeId = WorkflowElkNodeSizingResolver.resolve(workflowToLayout);
  const elkGraph = WorkflowElkGraphBuilder.build({ workflow: workflowToLayout, portInfoByNodeId, sizingByNodeId });
  const elkRoot = await ElkLayoutRunner.layout(elkGraph);
  return WorkflowElkResultMapper.toReactFlow({
    workflow: workflowToLayout,
    elkRoot,
    portInfoByNodeId,
    sizingByNodeId,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    nodeStatusesByNodeId,
    credentialAttentionTooltipByNodeId,
    selectedNodeId,
    propertiesTargetNodeId,
    pinnedNodeIds,
    isLiveWorkflowView,
    isRunning,
    workflowNodeIdsWithBoundCredential,
    onSelectNode,
    onOpenPropertiesNode,
    onRequestOpenCredentialEditForNode,
    onRunNode,
    onTogglePinnedOutput,
    onEditNodeOutput,
    onClearPinnedOutput,
  });
}
