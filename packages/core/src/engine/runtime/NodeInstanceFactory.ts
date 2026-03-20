import type { NodeId,NodeResolver,WorkflowDefinition } from "../../types";
import { MissingRuntimeNode,MissingRuntimeNodeToken,MissingRuntimeTrigger,MissingRuntimeTriggerToken } from "./persistedWorkflowResolver";

export class NodeInstanceFactory {
  constructor(private readonly nodeResolver: NodeResolver) {}

  createNodes(workflow: WorkflowDefinition): Map<NodeId, unknown> {
    const nodeInstances = new Map<NodeId, unknown>();
    for (const definition of workflow.nodes) {
      nodeInstances.set(definition.id, this.createNode(definition));
    }
    return nodeInstances;
  }

  createNode(definition: WorkflowDefinition["nodes"][number]): unknown {
    if (definition.type === MissingRuntimeNodeToken) {
      return new MissingRuntimeNode();
    }
    if (definition.type === MissingRuntimeTriggerToken) {
      return new MissingRuntimeTrigger();
    }
    return this.nodeResolver.resolve(definition.type);
  }
}
