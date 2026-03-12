import type { NodeDefinition, WorkflowDefinition, WorkflowId, WorkflowRegistry, PersistedWorkflowSnapshot } from "../../../types";
import { MissingRuntimeNodeDefinitionFactory } from "./MissingRuntimeNodeDefinitionFactory";
import { PersistedWorkflowConfigHydrator } from "./PersistedWorkflowConfigHydrator";
import { PersistedWorkflowTokenRegistry } from "./PersistedWorkflowTokenRegistry";

export class PersistedWorkflowResolver {
  private readonly missingNodeDefinitionFactory = new MissingRuntimeNodeDefinitionFactory();

  constructor(private readonly workflowRegistry: WorkflowRegistry) {}

  resolve(args: { workflowId: WorkflowId; workflowSnapshot?: PersistedWorkflowSnapshot }): WorkflowDefinition | undefined {
    const liveWorkflow = this.workflowRegistry.get(args.workflowId);
    if (!args.workflowSnapshot) {
      return liveWorkflow;
    }
    if (!liveWorkflow) {
      return this.rebuildWorkflow(args.workflowSnapshot, undefined);
    }
    return this.rebuildWorkflow(args.workflowSnapshot, liveWorkflow);
  }

  private rebuildWorkflow(snapshot: PersistedWorkflowSnapshot, liveWorkflow: WorkflowDefinition | undefined): WorkflowDefinition {
    const liveNodesById = new Map((liveWorkflow?.nodes ?? []).map((node) => [node.id, node] as const));
    const tokenRegistry = new PersistedWorkflowTokenRegistry(liveWorkflow ? [liveWorkflow] : []);
    const configHydrator = new PersistedWorkflowConfigHydrator(tokenRegistry);
    const nodes = snapshot.nodes.map((snapshotNode) => {
      const liveNode = liveNodesById.get(snapshotNode.id);
      if (!this.isCompatibleLiveNode(liveNode, snapshotNode)) {
        return this.missingNodeDefinitionFactory.create(snapshotNode);
      }
      const runtimeToken = tokenRegistry.resolve(snapshotNode.nodeTokenId);
      if (!runtimeToken) {
        return this.missingNodeDefinitionFactory.create(snapshotNode);
      }
      return {
        id: snapshotNode.id,
        kind: snapshotNode.kind,
        name: snapshotNode.name ?? liveNode.name,
        token: runtimeToken,
        tokenId: snapshotNode.nodeTokenId,
        config: configHydrator.hydrate(snapshotNode, liveNode.config),
      } satisfies NodeDefinition;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      id: snapshot.id,
      name: snapshot.name,
      nodes,
      edges: snapshot.edges.filter((edge) => nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId)),
    };
  }

  private isCompatibleLiveNode(
    liveNode: WorkflowDefinition["nodes"][number] | undefined,
    snapshotNode: PersistedWorkflowSnapshot["nodes"][number],
  ): liveNode is WorkflowDefinition["nodes"][number] {
    if (!liveNode || liveNode.kind !== snapshotNode.kind) {
      return false;
    }
    if (!snapshotNode.nodeTokenId || !snapshotNode.configTokenId) {
      throw new Error(`Persisted workflow snapshot node "${snapshotNode.id}" is missing stable token ids.`);
    }
    return liveNode.tokenId === snapshotNode.nodeTokenId && liveNode.config.tokenId === snapshotNode.configTokenId;
  }
}
