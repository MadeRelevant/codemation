import type { TypeToken } from "../di";
import type {
  NodeDefinition,
  PersistedWorkflowSnapshot,
  PersistedWorkflowTokenRegistryLike,
  WorkflowDefinition,
  WorkflowId,
  WorkflowRepository,
} from "../types";

import { MissingRuntimeFallbacks } from "./MissingRuntimeFallbacksFactory";
import { WorkflowSnapshotCodec } from "./WorkflowSnapshotCodec";

export class WorkflowSnapshotResolver {
  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly tokenRegistry: PersistedWorkflowTokenRegistryLike,
    private readonly codec: WorkflowSnapshotCodec,
    private readonly missingRuntimeFallbacks: MissingRuntimeFallbacks,
  ) {}

  resolve(args: {
    workflowId: WorkflowId;
    workflowSnapshot?: PersistedWorkflowSnapshot;
  }): WorkflowDefinition | undefined {
    const liveWorkflow = this.workflowRepository.get(args.workflowId);
    if (!args.workflowSnapshot) {
      return liveWorkflow;
    }
    if (!liveWorkflow) {
      return this.rebuildWorkflow(args.workflowSnapshot, undefined);
    }
    return this.rebuildWorkflow(args.workflowSnapshot, liveWorkflow);
  }

  private rebuildWorkflow(
    snapshot: PersistedWorkflowSnapshot,
    liveWorkflow: WorkflowDefinition | undefined,
  ): WorkflowDefinition {
    const liveNodesById = new Map((liveWorkflow?.nodes ?? []).map((node) => [node.id, node] as const));
    const nodes = snapshot.nodes.map((snapshotNode) => {
      const liveNode = liveNodesById.get(snapshotNode.id);
      if (!this.isCompatibleLiveNode(liveNode, snapshotNode)) {
        return this.missingRuntimeFallbacks.createDefinition(snapshotNode);
      }
      return {
        id: snapshotNode.id,
        kind: snapshotNode.kind,
        name: snapshotNode.name ?? liveNode.name,
        type: liveNode.type,
        config: this.codec.hydrate(snapshotNode, liveNode.config),
      } satisfies NodeDefinition;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const connectionsFromSnapshot =
      snapshot.connections
        ?.map((connection) => ({
          ...connection,
          childNodeIds: connection.childNodeIds.filter((childId) => nodeIds.has(childId)),
        }))
        .filter((connection) => connection.childNodeIds.length > 0) ?? [];
    return {
      id: snapshot.id,
      name: snapshot.name,
      nodes,
      edges: snapshot.edges.filter((edge) => nodeIds.has(edge.from.nodeId) && nodeIds.has(edge.to.nodeId)),
      ...(connectionsFromSnapshot.length > 0 ? { connections: connectionsFromSnapshot } : {}),
      ...(liveWorkflow?.discoveryPathSegments !== undefined
        ? { discoveryPathSegments: liveWorkflow.discoveryPathSegments }
        : {}),
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
