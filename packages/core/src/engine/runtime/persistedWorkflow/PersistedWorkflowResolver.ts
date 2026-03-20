import type { TypeToken } from "../../../di";
import type { NodeDefinition,PersistedWorkflowSnapshot,WorkflowDefinition,WorkflowId,WorkflowRegistry } from "../../../types";
import { MissingRuntimeNodeDefinitionFactory } from "./MissingRuntimeNodeDefinitionFactory";
import { PersistedWorkflowConfigHydrator } from "./PersistedWorkflowConfigHydrator";
import type { PersistedWorkflowTokenRegistry } from "./PersistedWorkflowTokenRegistryFactory";

export class PersistedWorkflowResolver {
  private readonly missingNodeDefinitionFactory = new MissingRuntimeNodeDefinitionFactory();

  constructor(
    private readonly workflowRegistry: WorkflowRegistry,
    private readonly tokenRegistry: PersistedWorkflowTokenRegistry,
  ) {}

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
    const configHydrator = new PersistedWorkflowConfigHydrator(this.tokenRegistry);
    const nodes = snapshot.nodes.map((snapshotNode) => {
      const liveNode = liveNodesById.get(snapshotNode.id);
      if (!this.isCompatibleLiveNode(liveNode, snapshotNode)) {
        return this.missingNodeDefinitionFactory.create(snapshotNode);
      }
      return {
        id: snapshotNode.id,
        kind: snapshotNode.kind,
        name: snapshotNode.name ?? liveNode.name,
        type: liveNode.type,
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
    const liveNodeTokenId = this.resolveLiveTokenId(liveNode.type);
    const liveConfigTokenId = this.resolveLiveTokenId(liveNode.config.type);
    return liveNodeTokenId === snapshotNode.nodeTokenId && liveConfigTokenId === snapshotNode.configTokenId;
  }

  private resolveLiveTokenId(type: TypeToken<unknown>): string | undefined {
    const registeredTokenId = this.tokenRegistry.getTokenId(type);
    if (registeredTokenId) {
      return registeredTokenId;
    }
    if (typeof type === "function" && type.name) {
      return type.name;
    }
    if (typeof type === "string") {
      return type;
    }
    return undefined;
  }
}
